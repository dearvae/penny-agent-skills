#!/usr/bin/env python3
"""Fill PropNex .docx form templates by replacing underscore blanks in place.

Pure stdlib — no python-docx needed. Works on the official templates bundled
in assets/templates/, preserving all original formatting, headers and footers.

Usage:
  python3 fill_form.py list <template.docx>
      Print every non-empty paragraph with its index and its blanks marked as
      <<k>> (k = blank index within that paragraph, with the blank's length).

  python3 fill_form.py fill <template.docx> <spec.json> <output.docx>
      Apply a spec (see below) and write a new .docx.

Spec JSON:
{
  "fills":    [{"p": 12, "blank": 0, "text": "TAN AH KOW"}, ...],
  "appends":  [{"p": 30, "text": "  4,500"}, ...],
  "strikes":  [41, 42],
  "replaces": [{"p": 50, "find": "remain at/changed to", "text": "remain at"}, ...],
  "strike_texts": [{"p": 60, "find": "with an Option to Renew"}, ...]
}

- fills:   put text into the k-th underscore blank of paragraph p (0-based).
           Filled text is underlined so it reads as a completed form entry.
- appends: add underlined text at the end of paragraph p (for label-only
           lines/cells such as CEA form tables: "Landlord (1) Name:").
- strikes: strike through the whole paragraph p (for "delete whichever is
           inapplicable" clauses).
- replaces: literal text replacement inside paragraph p (for slots that are
           not underscores, e.g. date fields like "  /  /  "). The `find`
           string must fall within a single run; the script errors otherwise.
- strike_texts: strike through just the `find` substring of paragraph p
           (same single-run restriction).

Unfilled blanks stay as underscores for hand-filling at signing.
"""
import json
import re
import sys
import zipfile

P_RE = re.compile(r'<w:p(?: [^>]*)?>.*?</w:p>', re.S)
R_RE = re.compile(r'<w:r(?: [^>]*)?>.*?</w:r>', re.S)
T_RE = re.compile(r'(<w:t(?: [^>]*)?>)(.*?)(</w:t>)', re.S)
BLANK_RE = re.compile(r'_{2,}')


def xml_escape(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def xml_unescape(s):
    return s.replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&')


class Run:
    def __init__(self, xml, start, end):
        self.xml = xml          # full <w:r>...</w:r> string
        self.start = start      # offsets within the paragraph string
        self.end = end
        self.text = xml_unescape(''.join(m[1] for m in T_RE.findall(xml)))

    def with_text(self, new_text, underline=False):
        """Return run xml with all <w:t> replaced by one containing new_text."""
        esc = xml_escape(new_text)
        first = [True]

        def sub(m):
            if first[0]:
                first[0] = False
                open_tag = m.group(1)
                if 'xml:space' not in open_tag:
                    open_tag = open_tag[:-1] + ' xml:space="preserve">'
                return open_tag + esc + m.group(3)
            return ''
        out = T_RE.sub(sub, self.xml)
        if underline and esc:
            out = add_rpr(out, '<w:u w:val="single"/>', drop=r'<w:u\b[^/]*/>')
        return out


def add_rpr(run_xml, prop, drop=None):
    """Insert a run property (e.g. <w:strike/>) into a run's rPr."""
    m = re.search(r'<w:rPr(?: [^>]*)?>', run_xml)
    if m:
        body_start = m.end()
        if drop:
            end = run_xml.index('</w:rPr>')
            seg = re.sub(drop, '', run_xml[body_start:end])
            run_xml = run_xml[:body_start] + seg + run_xml[end:]
        return run_xml[:body_start] + prop + run_xml[body_start:]
    m = re.search(r'<w:r(?: [^>]*)?>', run_xml)
    return run_xml[:m.end()] + '<w:rPr>' + prop + '</w:rPr>' + run_xml[m.end():]


class Paragraph:
    def __init__(self, xml):
        self.xml = xml
        self.runs = [Run(m.group(0), m.start(), m.end())
                     for m in R_RE.finditer(xml)
                     # exclude runs nested oddly (rare); keep those with <w:t> or none
                     ]
        self.text = ''.join(r.text for r in self.runs)

    def blanks(self):
        """Maximal underscore stretches in the concatenated text."""
        return [(m.start(), m.end()) for m in BLANK_RE.finditer(self.text)]

    def run_spans(self):
        spans, pos = [], 0
        for r in self.runs:
            spans.append((pos, pos + len(r.text), r))
            pos += len(r.text)
        return spans


def parse_paragraphs(doc):
    return [(m.start(), m.end(), m.group(0)) for m in P_RE.finditer(doc)]


def load_docx(path):
    z = zipfile.ZipFile(path)
    return z, z.read('word/document.xml').decode('utf8')


def save_docx(src_path, out_path, new_doc_xml):
    zin = zipfile.ZipFile(src_path)
    with zipfile.ZipFile(out_path, 'w', zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename == 'word/document.xml':
                data = new_doc_xml.encode('utf8')
            zout.writestr(item, data)


def cmd_list(path):
    _, doc = load_docx(path)
    for idx, (_, _, pxml) in enumerate(parse_paragraphs(doc)):
        para = Paragraph(pxml)
        if not para.text.strip():
            print(f'P{idx}: [empty]')
            continue
        display = para.text
        # mark blanks from the end so offsets stay valid
        bl = para.blanks()
        for k in range(len(bl) - 1, -1, -1):
            s, e = bl[k]
            display = display[:s] + f'<<{k}:{e - s}>>' + display[e:]
        tag = f' [blanks={len(bl)}]' if bl else ''
        print(f'P{idx}{tag}: {display}')


def rebuild_paragraph(para, run_replacements):
    """run_replacements: {run_obj: new_xml}. Returns new paragraph xml."""
    out, pos = [], 0
    for r in para.runs:
        out.append(para.xml[pos:r.start])
        out.append(run_replacements.get(id(r), r.xml))
        pos = r.end
    out.append(para.xml[pos:])
    return ''.join(out)


def apply_spec(doc, spec):
    paras = parse_paragraphs(doc)
    edits = {}   # paragraph index -> new xml

    def get_para(p):
        if p < 0 or p >= len(paras):
            sys.exit(f'ERROR: paragraph {p} out of range (0..{len(paras)-1})')
        return Paragraph(edits.get(p, paras[p][2]))

    # group fills per paragraph so offsets are computed once
    fills_by_p = {}
    for f in spec.get('fills', []):
        fills_by_p.setdefault(f['p'], []).append(f)

    for p, fills in fills_by_p.items():
        para = get_para(p)
        bl = para.blanks()
        spans = para.run_spans()
        repl = {}
        # collect per-run new texts
        run_texts = {id(r): r.text for _, _, r in spans}
        for f in sorted(fills, key=lambda x: -x['blank']):
            k = f['blank']
            if k >= len(bl):
                sys.exit(f'ERROR: P{p} has {len(bl)} blanks, no blank {k}. '
                         f'Run list mode to check. Text: {para.text[:120]!r}')
            s, e = bl[k]
            placed = False
            for rs, re_, r in spans:
                lo, hi = max(s, rs), min(e, re_)
                if lo >= hi:
                    continue
                t = run_texts[id(r)]
                seg_lo, seg_hi = lo - rs, hi - rs
                if not placed:
                    run_texts[id(r)] = t[:seg_lo] + '\x00' + f['text'] + '\x00' + t[seg_hi:]
                    placed = True
                else:
                    run_texts[id(r)] = t[:seg_lo] + t[seg_hi:]
        for rs, re_, r in spans:
            nt = run_texts[id(r)]
            if nt == r.text:
                continue
            if '\x00' in nt:
                # split into plain / filled / plain segments to underline only the value
                parts = nt.split('\x00')  # [before, value, after] possibly repeated
                segs_xml = []
                for i, part in enumerate(parts):
                    if part == '':
                        continue
                    segs_xml.append(r.with_text(part, underline=(i % 2 == 1)))
                repl[id(r)] = ''.join(segs_xml) if segs_xml else r.with_text('')
            else:
                repl[id(r)] = r.with_text(nt)
        edits[p] = rebuild_paragraph(para, repl)

    for a in spec.get('appends', []):
        p = a['p']
        para = get_para(p)
        rpr = ''
        if para.runs:
            m = re.search(r'<w:rPr(?: [^>]*)?>.*?</w:rPr>', para.runs[-1].xml, re.S)
            if m:
                rpr = m.group(0)
        if '<w:u ' not in rpr:
            rpr = (rpr.replace('</w:rPr>', '<w:u w:val="single"/></w:rPr>')
                   if rpr else '<w:rPr><w:u w:val="single"/></w:rPr>')
        new_run = (f'<w:r>{rpr}<w:t xml:space="preserve">'
                   f'{xml_escape(a["text"])}</w:t></w:r>')
        edits[p] = para.xml[:para.xml.rindex('</w:p>')] + new_run + '</w:p>'

    for p in spec.get('strikes', []):
        para = get_para(p)
        repl = {id(r): add_rpr(r.xml, '<w:strike/>') for r in para.runs if r.text}
        edits[p] = rebuild_paragraph(para, repl)

    for rp in spec.get('replaces', []) + spec.get('strike_texts', []):
        p = rp['p']
        para = get_para(p)
        target = rp['find']
        s = para.text.find(target)
        if s < 0:
            sys.exit(f'ERROR: {target!r} not found in P{p}. '
                     f'Paragraph text: {para.text[:200]!r}')
        e = s + len(target)
        is_replace = 'text' in rp
        repl = {}
        placed = False
        for rs, re_, r in para.run_spans():
            lo, hi = max(s, rs), min(e, re_)
            if lo >= hi:
                continue
            seg_lo, seg_hi = lo - rs, hi - rs
            before, mid, after = (r.text[:seg_lo], r.text[seg_lo:seg_hi],
                                  r.text[seg_hi:])
            if is_replace:
                if not placed:
                    repl[id(r)] = r.with_text(before + rp['text'] + after)
                    placed = True
                else:
                    repl[id(r)] = r.with_text(before + after)
            else:  # strike just the matched segment, keep the rest intact
                parts = []
                if before:
                    parts.append(r.with_text(before))
                parts.append(add_rpr(r.with_text(mid), '<w:strike/>'))
                if after:
                    parts.append(r.with_text(after))
                repl[id(r)] = ''.join(parts)
        edits[p] = rebuild_paragraph(para, repl)

    # splice edits back into the document
    out, pos = [], 0
    for idx, (s, e, _) in enumerate(paras):
        out.append(doc[pos:s])
        out.append(edits.get(idx, doc[s:e]))
        pos = e
    out.append(doc[pos:])
    return ''.join(out)


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    mode, path = sys.argv[1], sys.argv[2]
    if mode == 'list':
        cmd_list(path)
    elif mode == 'fill':
        spec = json.load(open(sys.argv[3]))
        _, doc = load_docx(path)
        new_doc = apply_spec(doc, spec)
        save_docx(path, sys.argv[4], new_doc)
        n = (len(spec.get('fills', [])) + len(spec.get('appends', []))
             + len(spec.get('strikes', [])) + len(spec.get('replaces', []))
             + len(spec.get('strike_texts', [])))
        print(f'OK: {n} edits -> {sys.argv[4]}')
    else:
        sys.exit(__doc__)


if __name__ == '__main__':
    main()
