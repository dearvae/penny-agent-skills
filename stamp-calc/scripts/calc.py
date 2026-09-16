#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""stamp-calc 算数核对脚本 · 税率截至 2026-09-17

只算数：不联网、不读写任何文件、不需要任何 API key 或账号。
税率和规则会变，用之前对一眼 IRAS / MAS 官网（链接见 SKILL.md「出处」一节）。

这是速算，不是税务意见，也不是贷款批复。
最终印花税以 IRAS 评定为准，最终可贷额度以银行 / HDB 批函为准。

用法：
  python3 scripts/calc.py --dry-run                 # 自检，打出 DRY-RUN PASS 才信它
  python3 scripts/calc.py --price 1800000 --profile sc --count 1 \
      --type private --tenure 25 --age 38 --income-fixed 15000
  python3 scripts/calc.py --price 1800000 --valuation 1700000 --profile spr --count 0 \
      --type private --tenure 25 --age 40 --income-fixed 9000 --income-variable 6000
  python3 scripts/calc.py --price 2500000 --profile fr --type nonres --ltv 70

`--help` 看全部参数。
"""

import argparse
import sys

AS_OF = "2026-09-17"

# ---------------------------------------------------------------- BSD

# (档宽, 税率)；最后一档档宽 None = 剩余全部
BSD_RESIDENTIAL = [(180_000, 0.01), (180_000, 0.02), (640_000, 0.03),
                   (500_000, 0.04), (1_500_000, 0.05), (None, 0.06)]
BSD_NON_RESIDENTIAL = [(180_000, 0.01), (180_000, 0.02), (640_000, 0.03),
                       (500_000, 0.04), (None, 0.05)]


def bsd_breakdown(base, residential=True):
    """返回 [(档号, 本档计税额, 税率, 本档税), ...]，按 IRAS 累进表。"""
    table = BSD_RESIDENTIAL if residential else BSD_NON_RESIDENTIAL
    rows, left = [], max(0, base)
    for idx, (width, rate) in enumerate(table, start=1):
        if left <= 0:
            break
        amt = left if width is None else min(left, width)
        rows.append((idx, amt, rate, amt * rate))
        left -= amt
    return rows


def bsd(base, residential=True):
    """BSD，向下取整到整元；有计税额时最低 $1。"""
    total = sum(r[3] for r in bsd_breakdown(base, residential))
    if base <= 0:
        return 0
    return max(1, int(total))  # int() 对正数即向下取整


# ---------------------------------------------------------------- ABSD

ABSD_RATES = {            # 名下已有住宅套数 0 / 1 / 2+
    "sc":     (0.00, 0.20, 0.30),
    "spr":    (0.05, 0.30, 0.35),
    "fr":     (0.60, 0.60, 0.60),
    "entity": (0.65, 0.65, 0.65),
}
ABSD_FLAT = {             # 不看第几套的两类
    "trustee":   0.65,    # ABSD (Trust)，受益人可识别时可在 6 个月内申请退差额
    "developer": 0.40,    # 35% 可先行豁免 / 退还 + 5% 不可豁免
}


def absd_rate(profile, count_owned, fta=False, residential=True):
    """ABSD 税率。非住宅一律 0（ABSD 只对住宅征收）。

    count_owned = 名下已有的**新加坡境内**住宅套数（海外房产不计入）。
    fta=True（冰岛 / 列支敦士登 / 挪威 / 瑞士的国民及 PR、美国国民）→ 按公民待遇。
    """
    if not residential:
        return 0.0
    p = profile.lower()
    if p in ABSD_FLAT:
        return ABSD_FLAT[p]
    if fta and p in ("fr", "spr"):
        p = "sc"
    if p not in ABSD_RATES:
        raise ValueError("身份只能是 sc / spr / fr / entity / trustee / developer：%s" % profile)
    if count_owned is None:
        raise ValueError("住宅场景必须给 --count（名下已有几套新加坡境内住宅），不能默认 0")
    idx = 0 if count_owned <= 0 else (1 if count_owned == 1 else 2)
    return ABSD_RATES[p][idx]


def absd(base, profile, count_owned, fta=False, residential=True):
    return int(max(0.0, base) * absd_rate(profile, count_owned, fta, residential))


# ---------------------------------------------------------------- LTV

LTV_CAPS = {0: (0.75, 0.55), 1: (0.45, 0.25), 2: (0.35, 0.15)}


def ltv(existing_loans, tenure_years, age, is_hdb_flat):
    """返回 (LTV, 最低现金首付比例, 是否降档, 降档原因)。只适用住宅。"""
    n = 0 if existing_loans <= 0 else (1 if existing_loans == 1 else 2)
    standard, lower = LTV_CAPS[n]
    tenure_cap = 25 if is_hdb_flat else 30
    reasons = []
    if tenure_years is not None and tenure_years > tenure_cap:
        reasons.append("年限 %s 年 > %s 年" % (tenure_years, tenure_cap))
    if tenure_years is not None and age is not None and age + tenure_years > 65:
        reasons.append("年龄 %s + 年限 %s = %s > 65" % (age, tenure_years, age + tenure_years))
    if reasons:
        cash = 0.10 if n == 0 else 0.25
        return lower, cash, True, "；".join(reasons)
    cash = 0.05 if n == 0 else 0.25
    return standard, cash, False, ""


def max_tenure(is_hdb_flat):
    return 30 if is_hdb_flat else 35


# ---------------------------------------------------------------- 月供

def factor(annual_rate, months):
    """(1+i)^n，i = 年利率 / 12。"""
    return (1 + annual_rate / 12.0) ** months


def pmt(principal, annual_rate, months):
    """等额本息月供，四舍五入到分。标准金融数学公式，不是政府页面上的算法。"""
    if months <= 0:
        raise ValueError("月数必须 > 0")
    if annual_rate == 0:
        return round(principal / months, 2)
    i = annual_rate / 12.0
    f = factor(annual_rate, months)
    return round(principal * i * f / (f - 1), 2)


def max_principal(monthly, annual_rate, months):
    """按月供上限反算最大可贷本金，向下取整到整元。"""
    if annual_rate == 0:
        return int(monthly * months)
    i = annual_rate / 12.0
    f = factor(annual_rate, months)
    return int(monthly * (f - 1) / (i * f))


# ---------------------------------------------------------------- TDSR / MSR

VARIABLE_HAIRCUT = 0.30   # MAS：可变收入至少打 30% haircut，银行可以更狠


def recognised_income(fixed, variable):
    """认可收入 = 固定工资 + 可变收入 × 70%。"""
    return fixed + variable * (1 - VARIABLE_HAIRCUT)


# ---------------------------------------------------------------- 报告

def money(x):
    return "S$%s" % format(int(round(x)), ",")


def money2(x):
    """月供、额度这类要看到分的数。"""
    return "S$%s" % format(round(float(x), 2), ",.2f")


def report(a):
    residential = a.type != "nonres"
    is_hdb_flat = a.type == "hdb"
    needs_msr = a.type in ("hdb", "ec-mop")
    stress = 0.04 if residential else 0.05
    if a.thereafter_rate is not None:
        stress = max(stress, a.thereafter_rate / 100.0)

    tax_base = max(a.price, a.valuation) if a.valuation else a.price
    loan_base = min(a.price, a.valuation) if a.valuation else a.price
    cov = max(0, a.price - a.valuation) if a.valuation else 0

    out = []
    out.append("税率截至 %s · 税率和规则会变，算完对一眼 IRAS 官网" % AS_OF)
    out.append("速算口径，不是税务意见也不是贷款批复。")
    out.append("")
    out.append("房型：%s%s" % (a.type, "" if residential else "（非住宅：不缴 ABSD、不走住宅 SSD、不看 MSR、压测 5%）"))
    out.append("税基 max(成交价, 估价) = %s｜贷款基数 min(成交价, 估价) = %s"
               % (money(tax_base), money(loan_base)))
    if not a.valuation:
        out.append("未提供估价 → 两个基数都按成交价；估价更高税更高，估价更低贷款更少。")
    if cov:
        out.append("估价缺口 COV = %s，必须全现金，不能用 CPF、不计入 LTV。" % money(cov))

    # 表一
    out.append("")
    out.append("表一：印花税（%s BSD 表）" % ("住宅" if residential else "非住宅"))
    for idx, amt, rate, tax in bsd_breakdown(tax_base, residential):
        out.append("  BSD 第 %d 档  %s × %s%% = %s"
                   % (idx, format(int(amt), ","), round(rate * 100, 2), money(tax)))
    b = bsd(tax_base, residential)
    out.append("  BSD 小计：%s" % money(b))
    if residential:
        r = absd_rate(a.profile, a.count, a.fta, True)
        ab = absd(tax_base, a.profile, a.count, a.fta, True)
        out.append("  ABSD：身份 %s%s · 名下已有 %s 套（只数新加坡境内）→ %s%% × %s = %s"
                   % (a.profile.upper(), "（FTA 按公民待遇）" if a.fta else "",
                      a.count, round(r * 100, 2), money(tax_base), money(ab)))
    else:
        ab = 0
        out.append("  ABSD：非住宅不缴 → 0")
        out.append("  注：非住宅可能另有 GST（卖方是 GST 注册人时），本技能不算、不给税率，问律师。")
    out.append("  印花税合计：%s（这笔不能贷款）" % money(b + ab))

    # 表二
    out.append("")
    out.append("表二：首付与贷款（全部用贷款基数）")
    if a.tenure is None:
        out.append("  待补：贷款年限")
    if residential:
        if a.loans is None:
            out.append("  待补：名下未偿房贷笔数（必问，不能默认 0）")
            rate_ltv = cash_pct = None
        elif a.ltv is not None:
            rate_ltv, cash_pct = a.ltv / 100.0, None
            out.append("  LTV：用了 --ltv %s%%（用户提供）" % a.ltv)
        else:
            rate_ltv, cash_pct, dropped, why = ltv(a.loans, a.tenure, a.age, is_hdb_flat)
            out.append("  LTV 判定：未偿房贷 %s 笔；%s → %s%%，最低现金首付 %s%%"
                       % (a.loans, ("降较低档（%s）" % why) if dropped else "不降档",
                          round(rate_ltv * 100, 2), round(cash_pct * 100, 2)))
            if a.tenure is not None and a.tenure > max_tenure(is_hdb_flat):
                out.append("  ⚠ 年限 %s 年超过上限 %s 年，先砍年限再重算。"
                           % (a.tenure, max_tenure(is_hdb_flat)))
    else:
        if a.ltv is None:
            out.append("  待补：贷款成数（非住宅不套 MAS 住宅上限，按银行政策，问 banker）")
            rate_ltv = cash_pct = None
        else:
            rate_ltv, cash_pct = a.ltv / 100.0, None
            out.append("  LTV：用了 --ltv %s%%（用户 / banker 提供，非 MAS 上限）" % a.ltv)

    loan = None
    if rate_ltv is not None:
        loan = a.loan_amount if a.loan_amount else loan_base * rate_ltv
        down = a.price - loan
        out.append("  贷款额 = %s × %s%% = %s"
                   % (money(loan_base), round(rate_ltv * 100, 2), money(loan)))
        out.append("  首付总额 = 成交价 %s − 贷款额 = %s" % (money(a.price), money(down)))
        if cash_pct is not None:
            min_cash = loan_base * cash_pct
            out.append("  └ 最低现金部分 = %s × %s%% = %s"
                       % (money(loan_base), round(cash_pct * 100, 2), money(min_cash)))
            if cov:
                out.append("  └ 估价缺口 COV（全现金）= %s" % money(cov))
            rest = down - min_cash - cov
            if residential and a.profile != "fr":
                out.append("  └ 可用 CPF OA 或现金 = %s" % money(rest))
            else:
                out.append("  └ 这部分也只能现金（外国人无 CPF OA / 非住宅不能用 CPF）= %s" % money(rest))
            out.append("  开工前要准备的现金（最低口径）= %s + %s + %s = %s"
                       % (money(min_cash), money(cov), money(b + ab),
                          money(min_cash + cov + b + ab)))
        else:
            out.append("  最低现金首付：待补（非住宅 / 自定 LTV，按银行政策）")

    # 表三
    out.append("")
    out.append("表三：月供与 TDSR / MSR")
    if loan is None or a.tenure is None:
        out.append("  待补：贷款额或年限不全，月供不算。")
    else:
        n = a.tenure * 12
        f = factor(stress, n)
        m = pmt(loan, stress, n)
        out.append("  n = %s 个月｜压测利率 %s%%｜i = %.8f｜(1+i)^n = %.8f"
                   % (n, round(stress * 100, 2), stress / 12.0, f))
        out.append("  压力测试月供（银行审批口径）= %s" % money2(m))
        if a.ref_rate is not None:
            if not a.ref_rate_date:
                out.append("  参考月供：不出——缺查询日。参考利率必须带「利率 + 非官方行情 + 查询日 + 来源」。")
            else:
                out.append("  参考月供 = %s（参考利率 %s%%，非官方行情，查询日 %s，%s）"
                           % (money2(pmt(loan, a.ref_rate / 100.0, n)), a.ref_rate,
                              a.ref_rate_date, a.ref_rate_source or "来源待补"))
                out.append("  ← 参考，实际以银行报价为准；查询日超过 14 天就先重查，重查不了就删掉这一行。")
        if a.income_fixed is None and a.income_variable is None:
            out.append("  待补：月收入（固定工资 / 可变收入分开给），TDSR 不判。")
        else:
            fixed = a.income_fixed or 0
            var = a.income_variable or 0
            inc = recognised_income(fixed, var)
            out.append("  认可收入 = 固定 %s + 可变 %s × 70%% = %s"
                       % (money(fixed), money(var), money2(inc)))
            if var:
                out.append("  （haircut 至少 30%，银行可以折得更多；自雇还要看两年记录）")
            limit = inc * 0.55 - (a.debts or 0)
            out.append("  TDSR 额度 = 认可收入 × 55%% − 现有债务 %s = %s"
                       % (money2(a.debts or 0), money2(limit)))
            out.append("  TDSR 判定：%s %s 额度 %s → %s"
                       % (money2(m), "≤" if m <= limit else ">", money2(limit),
                          "过" if m <= limit else "不过"))
            if needs_msr:
                msr_limit = inc * 0.30 - (a.other_property_loans or 0)
                out.append("  MSR 额度 = 认可收入 × 30%% − 其他房贷月供 = %s" % money2(msr_limit))
                out.append("  MSR 判定：%s" % ("过" if m <= msr_limit else "不过"))
                limit = min(limit, msr_limit)
            elif residential:
                out.append("  MSR：不适用（只有 HDB 和未过 MOP 的 EC 要看）")
            else:
                out.append("  MSR：非住宅不看")
            if m > limit:
                p_max = max_principal(limit, stress, n)
                out.append("  不过 → 按额度 %s 反算最大可贷本金 = %s（差 %s / 月）"
                           % (money2(limit), money(p_max), money2(m - limit)))
            out.append("  反推最低收入门槛 = %s / 0.55 = %s / 月（按全额固定收入算的下限；"
                       "有佣金 / 奖金要更高）" % (money2(m), money(m / 0.55)))

    out.append("")
    out.append("不含律师费、经纪佣金、估价费、房产税、物业费、装修与贷款相关费用。")
    out.append("税率和规则会变，算完对一眼 IRAS / MAS 官网（链接见 SKILL.md「出处」一节）。")
    return "\n".join(out)


# ---------------------------------------------------------------- 自检

def dry_run():
    checks = []

    def chk(name, got, want):
        checks.append((name, got, want, got == want))

    # BSD 住宅（对 SKILL.md 的速记表和三个例子）
    chk("BSD 住宅 180k", bsd(180_000), 1_800)
    chk("BSD 住宅 360k", bsd(360_000), 5_400)
    chk("BSD 住宅 1,000k", bsd(1_000_000), 24_600)
    chk("BSD 住宅 1,200k（例 2）", bsd(1_200_000), 32_600)
    chk("BSD 住宅 1,500k", bsd(1_500_000), 44_600)
    chk("BSD 住宅 1,800k（例 1）", bsd(1_800_000), 59_600)
    chk("BSD 住宅 2,500k（例 3）", bsd(2_500_000), 94_600)
    chk("BSD 住宅 3,000k", bsd(3_000_000), 119_600)
    # BSD 非住宅顶档 5%，3M 以上才和住宅分岔
    chk("BSD 非住宅 3,000k", bsd(3_000_000, False), 119_600)
    chk("BSD 非住宅 12,000k（顶档 5%）", bsd(12_000_000, False), 569_600)
    chk("BSD 住宅 12,000k（顶档 6%）", bsd(12_000_000, True), 659_600)
    # ABSD
    chk("ABSD SC 第 2 套 1,800k", absd(1_800_000, "sc", 1), 360_000)
    chk("ABSD SPR 第 1 套 1,200k", absd(1_200_000, "spr", 0), 60_000)
    chk("ABSD FR 2,500k", absd(2_500_000, "fr", 0), 1_500_000)
    chk("ABSD FR + FTA 按公民第 1 套", absd(2_500_000, "fr", 0, fta=True), 0)
    chk("ABSD 非住宅 = 0", absd(2_500_000, "fr", None, residential=False), 0)
    # LTV
    chk("LTV 0 笔 / 25 年 / 38 岁", ltv(0, 25, 38, False)[:2], (0.75, 0.05))
    chk("LTV 0 笔 / 30 年 / 42 岁（过 65）", ltv(0, 30, 42, False)[:2], (0.55, 0.10))
    chk("LTV 0 笔 / 23 年 / 42 岁（刚好 65）", ltv(0, 23, 42, False)[:2], (0.75, 0.05))
    chk("LTV 1 笔 / 25 年 / 38 岁", ltv(1, 25, 38, False)[:2], (0.45, 0.25))
    chk("LTV HDB 0 笔 / 26 年（> 25）", ltv(0, 26, 30, True)[:2], (0.55, 0.10))
    # 复利因子（对 SKILL.md 的因子速查表）
    chk("(1+i)^240 @4%", round(factor(0.04, 240), 8), 2.22258209)
    chk("(1+i)^276 @4%", round(factor(0.04, 276), 8), 2.50545428)
    chk("(1+i)^300 @4%", round(factor(0.04, 300), 8), 2.71376516)
    chk("(1+i)^360 @4%", round(factor(0.04, 360), 8), 3.31349801)
    chk("(1+i)^420 @4%", round(factor(0.04, 420), 8), 4.04576979)
    # 月供（对三个例子）
    chk("月供 1,350k / 25 年 @4%（例 1）", pmt(1_350_000, 0.04, 300), 7_125.80)
    chk("月供 1,350k / 25 年 @1.45%（例 1）", pmt(1_350_000, 0.0145, 300), 5_367.48)
    chk("月供 660k / 30 年 @4%（例 2A）", pmt(660_000, 0.04, 360), 3_150.94)
    chk("月供 900k / 23 年 @4%（例 2B）", pmt(900_000, 0.04, 276), 4_992.75)
    chk("月供 1,875k / 25 年 @4%（例 3）", pmt(1_875_000, 0.04, 300), 9_896.94)
    chk("反算本金 M=4,950 / 23 年 @4%（例 2B）", max_principal(4_950, 0.04, 276), 892_293)
    # 收入 haircut
    chk("认可收入 15,000 全固定", recognised_income(15_000, 0), 15_000)
    chk("认可收入 9,000 固定 + 6,000 佣金", recognised_income(9_000, 6_000), 13_200.0)
    chk("TDSR 额度 15,000 全固定", round(recognised_income(15_000, 0) * 0.55, 2), 8_250.0)
    chk("TDSR 额度 9,000 + 6,000 佣金", round(recognised_income(9_000, 6_000) * 0.55, 2), 7_260.0)

    bad = [c for c in checks if not c[3]]
    for name, got, want, ok in checks:
        print("%s %s：得到 %s" % ("PASS" if ok else "FAIL", name, got) + ("" if ok else "，应为 %s" % (want,)))
    print("")
    if bad:
        print("DRY-RUN FAIL（%d / %d 项不过）——脚本别用，先修。" % (len(bad), len(checks)))
        return 1
    print("DRY-RUN PASS（%d 项全过，对的是 examples/示例输出.md 和 SKILL.md 的速记表 / 因子表）" % len(checks))
    return 0


# ---------------------------------------------------------------- CLI

def main(argv=None):
    p = argparse.ArgumentParser(
        description="stamp-calc 算数核对（税率截至 %s）。不联网、不需要任何 key。" % AS_OF)
    p.add_argument("--dry-run", action="store_true", help="跑自检，打出 DRY-RUN PASS 才信它")
    p.add_argument("--price", type=float, help="成交价")
    p.add_argument("--valuation", type=float, help="估价 / 市价（有就给）")
    p.add_argument("--profile", default="sc",
                   help="买家身份：sc / spr / fr / entity / trustee / developer（联名取税率最高那个人）")
    p.add_argument("--fta", action="store_true",
                   help="FTA 优待国国籍（冰岛 / 列支敦士登 / 挪威 / 瑞士的国民及 PR、美国国民）→ 按公民待遇")
    p.add_argument("--count", type=int,
                   help="名下已有几套新加坡境内住宅（海外房产不计入）；住宅场景必给")
    p.add_argument("--type", default="private",
                   choices=["private", "hdb", "ec", "ec-mop", "nonres"],
                   help="房型：private 私宅 / hdb 组屋 / ec 已过 MOP 的 EC / ec-mop 未过 MOP 的 EC / nonres 非住宅")
    p.add_argument("--loans", type=int, help="名下未偿房贷笔数（必问，不能默认 0）")
    p.add_argument("--ltv", type=float, help="直接指定 LTV 百分比（非住宅或用户自带成数时用）")
    p.add_argument("--loan-amount", type=float, help="直接指定贷款额，覆盖 LTV 算出来的数")
    p.add_argument("--tenure", type=int, help="贷款年限（年）")
    p.add_argument("--age", type=int, help="借款人年龄（联名先算收入加权平均年龄）")
    p.add_argument("--income-fixed", type=float, help="月固定工资")
    p.add_argument("--income-variable", type=float, help="月可变收入（佣金 / 奖金 / 津贴），按 70%% 认")
    p.add_argument("--debts", type=float, help="现有每月债务义务（担保的房贷至少计 20%%）")
    p.add_argument("--other-property-loans", type=float, help="其他房产贷款月供（算 MSR 用）")
    p.add_argument("--thereafter-rate", type=float, help="银行 thereafter rate（%%），和压测下限取较高者")
    p.add_argument("--ref-rate", type=float, help="参考市场利率（%%），非官方行情")
    p.add_argument("--ref-rate-date", help="参考利率的查询日 YYYY-MM-DD（不给就不出参考月供）")
    p.add_argument("--ref-rate-source", help="参考利率的来源链接")
    a = p.parse_args(argv)

    if a.dry_run:
        return dry_run()
    if not a.price:
        p.error("要么 --dry-run，要么给 --price")
    if a.type != "nonres" and a.count is None and a.profile.lower() not in ABSD_FLAT:
        p.error("住宅场景必须给 --count（名下已有几套新加坡境内住宅）；不知道就回去问，不能默认 0")
    print(report(a))
    return 0


if __name__ == "__main__":
    sys.exit(main())
