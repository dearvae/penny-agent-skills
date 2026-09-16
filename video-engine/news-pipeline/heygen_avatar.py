#!/usr/bin/env python3
"""数字人（HeyGen）可选步骤 —— 学员版，通用。

用学员**自己的** HeyGen 账号：key 和数字人 id 都从 news-pipeline/.env.heygen 读（照 .env.heygen.example 填），
脚本里没有任何默认账号。没配这个文件就不要跑这一步，片子照样能出（纯画面 + 克隆声）。

用法（先跑完 TTS，再跑这个，再渲染）：
  ./.venv-tts/bin/python heygen_avatar.py --list                                   # 列出账号里的数字人 / 照片数字人，拿 id
  ./.venv-tts/bin/python heygen_avatar.py --script ../remotion-edit/public/newlaunch/<slug>/script.json
      默认处理 script.json 里写了 "avatar": true 的段（一般是开头和结尾各一段）
  ./.venv-tts/bin/python heygen_avatar.py --script ... --segments s1,s9             # 指定段
  ./.venv-tts/bin/python heygen_avatar.py --script ... --poll                       # 只轮询 / 下载之前提交的
  ./.venv-tts/bin/python heygen_avatar.py --script ... --dry                        # 只检查配置和要做哪些段，不调接口

流程：每段把 vo/<id>.mp3 上传成 audio asset → 用该音频生成数字人视频（口型对准克隆声）→ 轮询 → 下载到
<slug>/shots/avatar_<id>.mp4 → 把 manifest.json 里这段的 visual 改成 broll 指向它。任务 id 记在 <slug>/heygen_jobs.json，中断可续。
"""
import argparse, json, os, sys, time, urllib.request, urllib.error
from pathlib import Path

HERE = Path(__file__).resolve().parent
ENV_FILE = HERE / ".env.heygen"


def env() -> dict:
    cfg = {}
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1); cfg[k.strip()] = v.strip().strip('"').strip("'")
    for k in ("HEYGEN_API_KEY", "HEYGEN_AVATAR_ID", "HEYGEN_AVATAR_TYPE", "HEYGEN_BG"):
        if os.environ.get(k): cfg[k] = os.environ[k]
    if not cfg.get("HEYGEN_API_KEY"):
        sys.exit("缺 HEYGEN_API_KEY：照 news-pipeline/.env.heygen.example 建 .env.heygen（用学员自己的 HeyGen 账号）。不配数字人就跳过这一步。")
    return cfg


def req(cfg, url, data=None, headers=None, raw=None, method=None):
    h = {"X-Api-Key": cfg["HEYGEN_API_KEY"], **(headers or {})}
    body = raw if raw is not None else (json.dumps(data).encode() if data is not None else None)
    if body is not None and raw is None: h["Content-Type"] = "application/json"
    r = urllib.request.Request(url, data=body, headers=h, method=method or ("POST" if body is not None else "GET"))
    try:
        with urllib.request.urlopen(r, timeout=180) as resp: return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        sys.exit(f"HeyGen HTTP {e.code} {url}\n{e.read().decode()[:600]}\n（401 = key 不对或没开 API 权限；4xx 带 credit 字样 = 额度不够）")


def list_avatars(cfg):
    out = req(cfg, "https://api.heygen.com/v2/avatars")["data"]
    print("== 视频数字人 avatars（HEYGEN_AVATAR_TYPE=avatar）==")
    for a in out.get("avatars", [])[:60]:
        print(f"  {a.get('avatar_id')}  {a.get('avatar_name')}  {a.get('gender','')}")
    print("== 照片数字人 talking_photos（HEYGEN_AVATAR_TYPE=talking_photo）==")
    for t in out.get("talking_photos", [])[:60]:
        print(f"  {t.get('talking_photo_id')}  {t.get('talking_photo_name','')}")
    print("\n把要用的 id 写进 .env.heygen 的 HEYGEN_AVATAR_ID，类型写进 HEYGEN_AVATAR_TYPE。只能用学员本人的形象。")


def upload_audio(cfg, mp3: Path) -> str:
    out = req(cfg, "https://upload.heygen.com/v1/asset", raw=mp3.read_bytes(), headers={"Content-Type": "audio/mpeg"})
    return out["data"]["id"]


def character(cfg) -> dict:
    t = (cfg.get("HEYGEN_AVATAR_TYPE") or "talking_photo").strip()
    aid = cfg.get("HEYGEN_AVATAR_ID")
    if not aid: sys.exit("缺 HEYGEN_AVATAR_ID：先跑 --list 拿 id")
    if t == "avatar":
        return {"type": "avatar", "avatar_id": aid, "avatar_style": "normal", "scale": 1.0}
    return {"type": "talking_photo", "talking_photo_id": aid, "talking_style": "stable", "expression": "default", "scale": 1.0}


def generate(cfg, audio_asset_id: str, title: str, bg: str) -> str:
    payload = {
        "title": title,
        "dimension": {"width": 1080, "height": 1920},
        "video_inputs": [{
            "character": character(cfg),
            "voice": {"type": "audio", "audio_asset_id": audio_asset_id},
            "background": {"type": "color", "value": bg},
        }],
    }
    return req(cfg, "https://api.heygen.com/v2/video/generate", data=payload)["data"]["video_id"]


def status(cfg, video_id: str):
    return req(cfg, f"https://api.heygen.com/v1/video_status.get?video_id={video_id}")["data"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--script", help="script.json 路径（同目录要有 manifest.json 和 vo/）")
    ap.add_argument("--segments", help="逗号分隔的段 id；不写就用 script.json 里 avatar:true 的段")
    ap.add_argument("--poll", action="store_true"); ap.add_argument("--dry", action="store_true"); ap.add_argument("--list", action="store_true")
    ap.add_argument("--bg", help="数字人背景色，默认用 .env.heygen 的 HEYGEN_BG 或 #111111（应与视觉风格的底色一致）")
    a = ap.parse_args()
    cfg = env()
    if a.list: return list_avatars(cfg)
    if not a.script: sys.exit("要 --script")
    base = Path(a.script).resolve().parent
    script = json.loads((base / "script.json").read_text("utf-8"))
    man_p = base / "manifest.json"
    if not man_p.exists(): sys.exit("还没有 manifest.json：先跑 TTS 再跑数字人")
    man = json.loads(man_p.read_text("utf-8"))
    slug = script["slug"]
    want = set(a.segments.split(",")) if a.segments else {s["id"] for s in script["segments"] if s.get("avatar")}
    if not want: sys.exit("没有要做的段：script.json 里给开头 / 结尾那段加 \"avatar\": true，或用 --segments")
    bg = a.bg or cfg.get("HEYGEN_BG") or "#111111"
    (base / "shots").mkdir(exist_ok=True)
    jobs_f = base / "heygen_jobs.json"; jobs = json.loads(jobs_f.read_text()) if jobs_f.exists() else {}
    print(f"数字人段：{sorted(want)}  背景 {bg}  类型 {cfg.get('HEYGEN_AVATAR_TYPE','talking_photo')}")
    if a.dry: return print("--dry：配置齐全，不调接口。")
    if not a.poll:
        for s in man["segments"]:
            sid = s["id"]
            if sid not in want: continue
            dest = base / "shots" / f"avatar_{sid}.mp4"
            if dest.exists() or sid in jobs: print("跳过", sid); continue
            mp3 = base / s["audio"]; print("上传", mp3.name)
            aid = upload_audio(cfg, mp3); vid = generate(cfg, aid, f"{slug} {sid}", bg)
            jobs[sid] = {"video_id": vid, "audio_asset": aid}; jobs_f.write_text(json.dumps(jobs, indent=1)); print("提交", sid, vid)
    pending = {sid: j for sid, j in jobs.items() if sid in want and not (base / "shots" / f"avatar_{sid}.mp4").exists()}
    while pending:
        for sid, j in list(pending.items()):
            st = status(cfg, j["video_id"]); print(sid, st.get("status"), st.get("error") or "")
            if st.get("status") == "completed":
                urllib.request.urlretrieve(st["video_url"], base / "shots" / f"avatar_{sid}.mp4"); print("下载", sid); pending.pop(sid)
            elif st.get("status") == "failed": print("失败", sid, st); pending.pop(sid)
        if pending: time.sleep(20)
    # 接进 manifest：这段画面换成数字人视频（全屏 broll，静音，口播仍用 vo）
    n = 0
    for s in man["segments"]:
        f = base / "shots" / f"avatar_{s['id']}.mp4"
        if s["id"] in want and f.exists():
            s["visual"] = {"type": "broll", "src": f"newlaunch/{slug}/shots/avatar_{s['id']}.mp4", "zoom": 1.0}; n += 1
    man_p.write_text(json.dumps(man, ensure_ascii=False, indent=2), "utf-8")
    print(f"完成：{n} 段已换成数字人画面，重新渲染即可。")


if __name__ == "__main__":
    main()
