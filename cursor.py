#!/usr/bin/env python3
"""Cek status aktif/tidak aktif API key Cursor dengan tes prompt 'halo'."""

import json
import sys
import time
import urllib.error
import urllib.request

CURSOR_API = "https://api.cursor.com"
DEFAULT_MODEL = "composer-2.5"
TEST_PROMPT = "halo"

ACCOUNTS = {
    "Premium Portal 29": "crsr_0cb109aeb311aaed68fdbb6a146f6cf1ead49d53dd9b697d5c6260fcf5240da0",
    "Premium Portal 28": "crsr_283c13e0b61fd5afa126a85f17011374e8055912129fb7fb39567d548d612a39",
    "Premium Portal 27": "crsr_818d6a038d36b0d6ac2a361651079c356d65d611b268a54bc0decada2b01293c",
    "Premium Portal 26": "crsr_d9a9509fea33b31a3f4785199a22485339f5001d0250037336e1d96847eebce2",
    "Premium Portal 25": "crsr_fa1776990a3aa3477d8b6da39a40bb6eb9fbf80dbd84e9d74f70c7198c36466f",
    "Premium Portal 24": "crsr_cedebc23b8275a12f1e89a6bb90e656bda32340316b10683a348749fa0e898b1",
    "Premium Portal 23": "crsr_bf190218c15b28d56c30046d87be0c58f3e5121d56766e91c75313cabe4d6bd3",
    "Premium Portal 22": "crsr_bf9e1c3ae30b13327355e2a272f720914a33ac73662fe5a26ec10c129dfe5755",
    "Premium Portal 21": "crsr_83d8d1cbd6fc630951e9d3a2207838002c1fc3d6564e57cc054f3788ffb1cfd7",
    "Premium Portal 20": "crsr_a8f94fa2aa16617b1105d7aed0b9380b1d5ad25a2034eb79da7643892908b5f7",
    "Premium Portal 19": "crsr_b0c10db276229e99937418a4b2254b1cb849ef1c2e544f25d97d581dbc168153",
    "Premium Portal 18": "crsr_bf052e728beba9cb68c3ef5664202003f3b52e55ae0db7c3bb23c03885640944",
    "Premium Portal 17": "crsr_27fee4b24f8e3e280bb67db2e034668d8d25c524f49fd93ea867b65b042dbf45",
    "Premium Portal 16": "crsr_f06987c220ea4807f458acc20e2d31dec4fce0cafae3b38a055a548eea28bb0b",
    "Premium Portal 15": "crsr_2f0c67872cf2185904f021b25742332df53df364b905e7fca9a086f2bc4f7b88",
    "Premium Portal 14": "crsr_f2cce97e6bc2acbc8cab8b1b6ef678be2101447297c9efaf1811051cd072de1e",
    "Premium Portal 13": "crsr_d330b61dceb6a9bd0b36868aed72cf8b6ce5f8ed8ee0c2564d8cfd77677904b5",
    "Premium Portal 12": "crsr_26a8b76c2ffc5bebd7d23fc7846c798a7949f32f876d0fcceb5cb050fc103904",
    "Premium Portal 11": "crsr_042b914127c2d1b10ecff69651ed9f8706e44209fb7a18c17aa88d7d566a8459",
    "Premium Portal 10": "crsr_027337bf4ad538d62546228f0165cc6f59b0c8e3b26d1339664a5f15bcbbce6f",
    "Premium Portal 9": "crsr_5ef9eb55e6c9c0fdfe06e91e41c709325e6a7b376bde23b4bd6250d94f753fb8",
    "Premium Portal 8": "crsr_5b0ff99193b8537d0de1528c311368d3b63a77d849a9dd7650771ba5032121c0",
    "Premium Portal 7": "crsr_46af345538b55349822578af512e329ee684bb07c091abc21a04d525ac41f5a4",
    "Premium Portal 6": "crsr_9d1e68ed24bb35d72e26c19c82433b5d0701c825644faa39d9c7132040515bef",
    "Premium Portal 5": "crsr_d9c4c613722a52a0fd665d4b77929032dcece7f6cf3a6fe05bb632fc8f217255",
    "Premium Portal 4": "crsr_023b8c73cea0345310265eeac78fbaaae2322a75a94f59056cf35bb534b6c151",
    "Premium Portal 3": "crsr_8f0a8bee23c41a240b9c5029cada1aceb8274fe3f4f264c225ce70e3b481cb56",
    "Premium Portal 2": "crsr_5f6a0ecd33e69c855f05fe7121ee138bb8e06a477e9c88628f6d7e7e1e424108",
    "Premium Portal 1": "crsr_b05ba85a83fec0a58739b0c93d4fc09f0ef6d67876818794cf0c91cf246c8625",
}


def api_request(api_key: str, method: str, path: str, body=None, accept=None):
    url = f"{CURSOR_API}{path}"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    if accept:
        headers["Accept"] = accept

    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")

    req = urllib.request.Request(url, data=data, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            status = resp.status
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        status = exc.code
    except Exception as exc:
        return {"ok": False, "status": 0, "error": str(exc), "data": None}

    parsed = None
    if raw:
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = raw

    return {"ok": 200 <= status < 300, "status": status, "data": parsed, "error": None}


def extract_error(data):
    if not isinstance(data, dict):
        return str(data)[:200]
    err = data.get("error")
    if isinstance(err, dict):
        return err.get("message") or err.get("code") or str(err)
    return data.get("message") or str(data)


def get_user_info(api_key: str):
    result = api_request(api_key, "GET", "/v1/me")
    if not result["ok"]:
        return None, extract_error(result["data"])

    data = result["data"] or {}
    first = data.get("userFirstName") or ""
    last = data.get("userLastName") or ""
    name = " ".join(part for part in [first, last] if part).strip() or data.get("apiKeyName") or "-"
    email = data.get("userEmail") or "-"
    return {"name": name, "email": email}, None


def wait_for_run(api_key: str, agent_id: str, run_id: str, max_attempts=40):
    for _ in range(max_attempts):
        result = api_request(api_key, "GET", f"/v1/agents/{agent_id}/runs/{run_id}")
        if not result["ok"]:
            return None, extract_error(result["data"])

        data = result["data"] or {}
        status = data.get("status")
        if data.get("result"):
            return data["result"], None
        if status in {"ERROR", "CANCELLED", "EXPIRED"}:
            return None, f"Run {status}"
        if status == "FINISHED":
            return data.get("result"), None

        time.sleep(1.5)

    return None, "Timeout menunggu hasil run"


def read_stream(api_key: str, agent_id: str, run_id: str):
    url = f"{CURSOR_API}/v1/agents/{agent_id}/runs/{run_id}/stream"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Accept": "text/event-stream",
    }
    req = urllib.request.Request(url, headers=headers, method="GET")

    texts = []
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            buffer = ""
            while True:
                chunk = resp.read(4096)
                if not chunk:
                    break
                buffer += chunk.decode("utf-8", errors="replace")
                parts = buffer.split("\n\n")
                buffer = parts.pop() if parts else ""

                for part in parts:
                    event_name = "message"
                    data_line = ""
                    for line in part.split("\n"):
                        if line.startswith("event:"):
                            event_name = line[6:].strip()
                        elif line.startswith("data:"):
                            data_line += line[5:].strip()
                    if not data_line:
                        continue
                    try:
                        payload = json.loads(data_line)
                    except json.JSONDecodeError:
                        continue
                    if event_name in {"assistant", "result"} and payload.get("text"):
                        texts.append(payload["text"])
    except Exception:
        return None

    combined = "".join(texts).strip()
    return combined or None


def send_test_prompt(api_key: str):
    body = {
        "prompt": {"text": TEST_PROMPT},
        "mode": "plan",
        "model": {
            "id": DEFAULT_MODEL,
            "params": [{"id": "fast", "value": "true"}],
        },
    }
    result = api_request(api_key, "POST", "/v1/agents", body=body)
    if not result["ok"]:
        return None, extract_error(result["data"])

    data = result["data"] or {}
    agent_id = (data.get("agent") or {}).get("id")
    run_id = (data.get("run") or {}).get("id")
    if not agent_id or not run_id:
        return None, "Respons agent tidak lengkap"

    time.sleep(1)
    output = read_stream(api_key, agent_id, run_id)
    if output:
        return output, None

    output, err = wait_for_run(api_key, agent_id, run_id)
    if output:
        return output, None
    return None, err or "Tidak ada output dari API"


def shorten(text: str, limit=120):
    text = " ".join((text or "").split())
    if len(text) <= limit:
        return text
    return text[: limit - 3] + "..."


def check_account(label: str, api_key: str):
    user, me_err = get_user_info(api_key)
    if not user:
        return {
            "label": label,
            "name": label,
            "email": "-",
            "status": "TIDAK AKTIF",
            "output": me_err,
        }

    output, prompt_err = send_test_prompt(api_key)
    if output:
        status = "AKTIF"
        out_text = shorten(output)
    else:
        status = "TIDAK AKTIF"
        out_text = prompt_err or "Gagal kirim prompt"

    return {
        "label": label,
        "name": user["name"],
        "email": user["email"],
        "status": status,
        "output": out_text,
    }


def main():
    results = []
    total = len(ACCOUNTS)

    print(f"Memeriksa {total} API key Cursor...\n", flush=True)

    for idx, (label, api_key) in enumerate(ACCOUNTS.items(), start=1):
        print(f"[{idx}/{total}] {label} ...", flush=True)
        result = check_account(label, api_key)
        line = f"{result['name']} - {result['email']} = {result['status']} - {result['output']}"
        result["line"] = line
        results.append(result)
        print(line, flush=True)
        print(flush=True)

    aktif = sum(1 for r in results if r["status"] == "AKTIF")
    tidak = total - aktif

    print("=" * 80)
    print("RINGKASAN")
    print("=" * 80)
    print(f"Total   : {total}")
    print(f"Aktif   : {aktif}")
    print(f"Tidak   : {tidak}")
    print()
    print("DETAIL:")
    for r in results:
        print(r["line"])

    return 0 if aktif else 1


if __name__ == "__main__":
    sys.exit(main())
