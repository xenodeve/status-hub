# Status Hub — Design Spec

- **วันที่:** 2026-08-18
- **สถานะ:** รอรีวิว
- **ชื่อโปรเจกต์:** Status Hub (ตั้งใจให้กว้าง — อนาคตจะเฝ้าเว็บของทีมเองด้วย ไม่ใช่แค่ AI)

---

## 1. บริบท — ทำไมต้องมีสิ่งนี้

ทีมใช้ AI gateway และ model จากหลายเจ้าพร้อมกันในหลายโปรเจกต์ เวลาโค้ดรันไม่ผ่านหรือ agent ตอบช้าผิดปกติ คำถามแรกคือ *"ของเราพัง หรือของเขาล่ม"* ทุกวันนี้ต้องไล่เปิด status page ทีละเจ้าเพื่อตอบคำถามนั้น

ปัญหาที่ใหญ่กว่าคือ **status page ของ vendor ขึ้นช้า** — Anthropic/OpenAI มักยอมรับว่ามีปัญหาหลังผู้ใช้เจอไปแล้วเป็นสิบนาที และ **9arm gateway ไม่มี status page เลย** ทั้งที่เป็นตัวที่ทีมใช้หนักที่สุด

Status Hub รวมสถานะทั้งหมดไว้หน้าเดียว โดยไม่พึ่งคำประกาศของ vendor อย่างเดียว แต่**ยิงเช็คจริง**ด้วย เปิดเป็น public ให้คนนอกทีมใช้ได้

### ผลลัพธ์ที่ต้องการ

- เปิดหน้าเดียวรู้ทันทีว่าเจ้าไหน/โมเดลไหนใช้ได้อยู่
- ย้อนดูประวัติได้ว่าแต่ละตัวมีปัญหาตอนไหน อาการอะไร กินเวลาเท่าไร — แบบ Claude Status และย้อนได้**ไกลกว่า 90 วัน**
- อัปเดตเองแบบ realtime ผู้ใช้ไม่ต้องกด refresh
- (เฟส 2) แจ้งเตือนผ่าน Discord bot

---

## 2. ขอบเขต

### เฟส 1 (spec นี้)
- เฝ้า 5 แหล่ง: 9arm gateway, Anthropic, OpenAI, Google (Gemini/Vertex), openCode
- สถานะปัจจุบัน + ประวัติรายวันถาวร + บันทึก incident
- Realtime push
- Public อ่านอย่างเดียว ไม่มีระบบ login

### เฟส 2 (ไม่อยู่ใน spec นี้)
- Discord bot แจ้งเตือน

### นอกขอบเขตทั้งหมด
- ระบบผู้ใช้ / subscribe รายบุคคล
- หน้า admin (แก้ config ผ่าน SQL ตรงๆ ในเฟส 1)
- Scheduled maintenance (เก็บไว้ตอนเริ่มเฝ้าเว็บของทีมเอง)

---

## 3. Stack

```
Cloudflare  →  DNS อย่างเดียว (เมฆเทา ไม่ proxy) + โดเมน
Vercel      →  Next.js — เสิร์ฟหน้าเว็บ public เท่านั้น (Hobby ฟรี)
Supabase    →  Postgres + pg_cron + pg_net + Edge Function + Realtime (Free)
```

**รวม $0/เดือน**

### เหตุผลที่ต้องเป็นแบบนี้ (ไม่ใช่แค่ความชอบ)

| ข้อจำกัดจริง | ผลต่อการออกแบบ |
|---|---|
| **Vercel Cron บน Hobby ยิงได้วันละครั้ง** | Vercel เป็น poller ไม่ได้ — ต้องขึ้น Pro $20/เดือน |
| **Supabase Cron (`pg_cron`) รันได้ทุกวินาที บน Free** | poller อยู่ที่ Supabase → Vercel เหลือแค่เสิร์ฟเว็บ → อยู่ Hobby ได้ |
| **Vercel ไม่แนะนำให้ proxy คร่อมหน้า** | Cloudflare ตั้งเป็น DNS-only (เมฆเทา) เท่านั้น |
| **Supabase Free: DB 500 MB แล้ว read-only** | บังคับให้ต้องออกแบบ rollup (ดูข้อ 5) |
| **Supabase Free: pause ถ้าเงียบเกิน 7 วัน** | ไม่กระทบ — ระบบเขียนทุกนาที |
| **Supabase Free: realtime 200 connection พร้อมกัน** | ต้องมี fallback เป็น polling เมื่อชนเพดาน |

อ้างอิง: [Vercel Cron pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing) · [Cloudflare in front of Vercel](https://vercel.com/kb/guide/cloudflare-with-vercel) · [Supabase Cron](https://supabase.com/docs/guides/cron) · [Supabase database size](https://supabase.com/docs/guides/platform/database-size)

---

## 4. สถาปัตยกรรม

```
Cloudflare ── DNS only ──► Vercel (Next.js)
                             │  SSR หน้าแรก แล้ว subscribe realtime
                             │  anon key — อ่านอย่างเดียว
                             ▼
┌─ Supabase ────────────────────────────────────────────┐
│                                                        │
│  pg_cron ──(pg_net POST)──► Edge Function `collect`    │
│                                 │                      │
│                                 ├─ statuspage adapter  │  Anthropic, OpenAI
│                                 ├─ gcp-incidents       │  Google
│                                 ├─ litellm             │  9arm  ◄── auto-discovery
│                                 ├─ rss                 │  openCode
│                                 └─ http-probe          │  เว็บทีมเอง (อนาคต)
│                                 │                      │
│                                 ▼                      │
│  Postgres ──► trigger ──► Realtime Broadcast ──────────┼──► client
└────────────────────────────────────────────────────────┘
```

**หัวใจคือ adapter** — แต่ละแหล่งพูดคนละภาษา (JSON / RSS / API) แต่ทุกตัวคืนค่าเป็นรูปแบบเดียวกันก่อนลง DB การเพิ่มแหล่งใหม่ = เขียนไฟล์เดียว ไม่แตะส่วนอื่น

### จังหวะ cron

| ทุก | ทำอะไร | ทำไม |
|---|---|---|
| **1 นาที** | เช็คเบา — statuspage JSON, `/health/readiness` | ฟรี ไม่ใช้ key |
| **5 นาที** | discovery + probe หนัก (ดูข้อ 6) | มีต้นทุน |
| **วันละครั้ง** | ปิดยอด rollup เมื่อวาน + ตรวจความสมบูรณ์ | |

---

## 5. โครงข้อมูล — เขียวไม่เขียน, ไม่เขียวเขียนละเอียด

### ปัญหาที่ต้องแก้

ถ้าเก็บผลเช็คทุกครั้ง: `10 component × 1,440 ครั้ง/วัน × 90 วัน ≈ 1.3 ล้านแถว ≈ 400–500 MB` → **ชนเพดาน Free ภายในสามเดือน**

และแถบ 90 วันแบบ Claude Status นั้น**แท่งละ 1 วัน** อยู่แล้ว — ข้อมูลรายนาทีไม่เคยถูกใช้วาดมันเลย

### ตาราง

| ตาราง | เขียนเมื่อไร | โตแค่ไหน |
|---|---|---|
| `sources` | ตอน config | คงที่ |
| `components` | ตอน discovery เจอของใหม่ | คงที่ + โตช้า |
| `component_state` | **UPDATE ทุกครั้งที่เช็ค** (แถวเดิม) | 1 แถว/component ตลอดกาล |
| `daily_rollups` | **UPSERT ทุกครั้งที่เช็ค** | 1 แถว/component/วัน ≈ **1 MB/ปี** |
| `status_events` | เฉพาะตอน**เปลี่ยน**สถานะ | ปีละไม่กี่ร้อยแถว |
| `incidents` | เฉพาะตอนเปิด/ปิด incident | ปีละไม่กี่สิบแถว |
| `check_samples` | **เฉพาะตอนสถานะไม่เขียว** | เท่ากับเวลาที่ล่มจริง |

**ไม่มีตารางข้อมูลดิบถาวร ไม่ต้อง prune อะไรเลย** — 10 ปียังไม่ถึง 20 MB

### กติกาสำคัญ: แถวมี = เช็คแล้ว, ไม่มีแถว = ไม่ได้เช็ค

`daily_rollups` จะมีแถวของวันนั้นก็ต่อเมื่อวันนั้นเช็คจริง วันที่ระบบตายไม่มีแถว → หน้าเว็บวาดเป็น **ช่องว่างสีจาง = no-data** ไม่ใช่เขียว

**ข้อยกเว้นเดียว** — ป้ายสถานะสดบนหัวหน้าเว็บใช้ความละเอียดระดับวันไม่ได้ (collector ตายตอนเที่ยง แถววันนี้เขียนไปแล้วตอนเช้า) จึงใช้ `component_state.last_checked_at` ซึ่งเป็นคอลัมน์บนตารางที่ UPDATE ทับ **ไม่เพิ่มแถว ไม่เพิ่มขนาด DB** ถ้าค่าเก่าเกิน 5 นาที → ขึ้น **Stale** สีเทา

### latency โดยไม่เก็บแถวดิบ

เก็บ histogram ใน `daily_rollups.latency_buckets` (jsonb) บวกทีละครั้ง ขนาดคงที่:

```json
{ "<100": 820, "<250": 410, "<500": 150, "<1000": 48, "<3000": 11, "3000+": 1 }
```

ให้ p50/p95 แบบประมาณการที่แม่นพอสำหรับ dashboard **สิ่งที่ยอมเสีย:** ย้อนดู latency รายนาทีของวันปกติไม่ได้ (ช่วงที่ล่มมี `check_samples` เก็บละเอียดอยู่แล้ว ซึ่งเป็นช่วงเดียวที่คนอยากย้อนดูจริง)

---

## 6. 9arm gateway — auto-discovery

9arm เปลี่ยนโมเดลบ่อย การ hardcode รายชื่อแปลว่าต้องตามแก้เองตลอด **ทุก adapter ต้อง discover ไม่ hardcode** (Anthropic/OpenAI ก็อ่าน component list สดจาก `summary.json` เช่นกัน)

### ข้อเท็จจริงที่ยืนยันแล้ว (ยิงจริง 2026-08-18)

| endpoint | auth | ผล |
|---|---|---|
| `/health/liveliness` | ไม่ต้อง | `"I'm alive!"` |
| `/health/readiness` | ไม่ต้อง | `{"status":"healthy","db":"connected"}` |
| `/health` | ต้องมี | LiteLLM เช็คทุกโมเดลให้เอง คืน `healthy_endpoints`/`unhealthy_endpoints` |
| `/v1/models` | ต้องมี | รายชื่อโมเดล |
| `/v1` | — | 404 |

gateway เป็น **LiteLLM proxy** (ยืนยันจาก error format) และรองรับ **Anthropic Messages API** (`/v1/messages` + header `x-api-key`, `anthropic-version`) ตามที่เห็นในโค้ด open-status-page — ต้องยืนยันอีกครั้งว่ารองรับ `/v1/chat/completions` แบบ OpenAI ด้วยหรือไม่

### Capability detection — รองรับ key ทั้งสองระดับ

ยังไม่รู้ว่า key ที่มีเป็น master หรือ virtual จึงตรวจเอาตอนรัน:

```
เรียก GET /health พร้อม key
  200      → mode = "litellm-health"   ใช้ผลของ LiteLLM ไม่ต้องยิง inference เอง (ถูก + สุภาพกับ gateway)
  401/403  → mode = "self-probe"       discover จาก /v1/models แล้วยิง inference รายตัว
บันทึกผลลง sources.config.capability แล้วตรวจซ้ำทุก 6 ชม. (เผื่อสิทธิ์ key เปลี่ยน)
```

โค้ดชุดเดียวรองรับทั้งสองทาง ไม่ต้องตัดสินใจตอนนี้

### วงจร sync

| เจอ | ทำอะไร |
|---|---|
| โมเดลใหม่ | สร้าง component `first_seen_at = now` เริ่มเก็บประวัติทันที |
| โมเดลเดิม | อัปเดต `last_seen_at` |
| โมเดลหายไป | **ไม่ลบ** — ตั้ง `retired_at` ประวัติเก่ายังดูย้อนหลังได้ตลอดไป |

การไม่ลบสำคัญ — ไม่งั้นวันที่ 9arm ถอดโมเดล ประวัติที่มีค่าที่สุด ("ตัวนี้ล่มบ่อยจนโดนถอดใช่ไหม") หายวับ

### family / variant — กันประวัติขาดตอน

ชื่อโมเดลจริงมี suffix เวอร์ชัน: `deepseek-v4-flash-0731`, `qwen3.8-27b-fp8`

ถ้า 9arm อัปเป็น `-0815` ระบบจะเห็นเป็นโมเดลใหม่ → **แถบ uptime เริ่มนับหนึ่งใหม่** ยิ่งเปลี่ยนบ่อย กราฟยิ่งไม่มีวันยาวพอให้ดูอะไรได้

แก้ด้วยการแยกสองชั้น:

```
family  : deepseek-v4-flash              ← แถบ uptime ผูกกับชั้นนี้ ต่อเนื่องข้ามเวอร์ชัน
  variant: deepseek-v4-flash-0731        (17 ก.ค. – 12 ส.ค.)
  variant: deepseek-v4-flash-0815        (12 ส.ค. – ปัจจุบัน)
```

normalize ด้วย regex ตัด `-\d{4}$` (วันที่) และ `-(fp8|awq|int4|gguf)$` (quantization) **เก็บกฎไว้ในตาราง แก้ได้โดยไม่ต้อง deploy**

ผลพลอยได้: การเปลี่ยนโมเดลกลายเป็น**ข้อมูลที่มองเห็น** — บนแถบมีเส้นเล็กๆ ตรงวันที่เปลี่ยน กดแล้วขึ้นว่าเปลี่ยนจากอะไรเป็นอะไร มีประโยชน์มากตอนหา root cause ว่า latency พุ่งตั้งแต่เขาสลับเวอร์ชัน

### กันค่าใช้จ่ายบานปลาย

ถ้าวันหนึ่ง gateway มี 30 โมเดล ระบบจะยิง `30 × 288 = 8,640 inference/วัน` เข้า gateway ของคอมมูนิตี้โดยไม่มีใครกดอนุมัติ กันสามชั้น:

- `probe_enabled` เปิด/ปิดรายโมเดลจาก DB ไม่ต้อง deploy
- เพดาน `max_probes_per_run` — เกินแล้ววนยิงแบบ round-robin
- โมเดลที่เพิ่ง discover **เริ่มจากเช็คแบบเบา** (แค่นับว่ามีอยู่ในลิสต์) ต้องกดยืนยันถึงเปิด inference probe
- probe ใช้ `max_tokens: 1` และ prompt สั้นที่สุดเสมอ

---

## 7. เกณฑ์ตัดสินสถานะ

### จาก HTTP status — จุดที่ open-status-page พลาด

open-status-page ใช้ `ok = status < 500` ทำให้ **401 (key หมดอายุ) และ 429 (rate limit) นับเป็นปกติ** → หน้าเว็บขึ้นเขียวทั้งที่ทีมยิง API ไม่ได้เลย นี่คือ false-green ซึ่งแย่กว่าไม่มี monitoring เพราะมันโกหกอย่างมั่นใจ

> **หมายเหตุเพื่อความเป็นธรรม:** กติกา `401 = operational` ของเขาเป็นการตัดสินใจโดยตั้งใจ (commit `d14e29a` — *"use unauthenticated ping — 401 = operational, no token consumed"*) ซึ่ง**สมเหตุสมผลสำหรับ ping ที่ไม่ยืนยันตัวตน** เพราะ 401 พิสูจน์ว่าเซิร์ฟเวอร์ยังตอบอยู่โดยไม่เปลืองโทเคน ปัญหาคือกติกานี้ตกทอดมาถึง path ที่ยิง inference แบบยืนยันตัวตนด้วย ซึ่งตรงนั้น 401 แปลว่าใช้งานไม่ได้จริง — บทเรียนคือ **เกณฑ์ตัดสินต้องผูกกับชนิดของการเช็ค ไม่ใช่ผูกกับตัว HTTP status อย่างเดียว**

| ผลลัพธ์ | สถานะ | สี |
|---|---|---|
| `2xx` และเร็วกว่าเกณฑ์ | operational | เขียว |
| `2xx` แต่ช้ากว่าเกณฑ์ | degraded | ส้ม |
| `429` | degraded (rate limit ≠ ล่ม) | ส้ม |
| `5xx` / timeout / เชื่อมต่อไม่ได้ | down | แดง |
| `401` / `403` | **misconfigured — ปัญหาฝั่งเรา** | เทา |
| เช็คไม่สำเร็จเพราะเน็ตฝั่งเรา | **unknown** | เทา |
| ไม่มีข้อมูลของวันนั้น | no-data | จาง |

**สองแถวสุดท้ายสำคัญมาก** — ถ้าไม่แยก "เราเช็คไม่ได้" ออกจาก "เขาล่ม" เน็ต Supabase สะดุดครั้งเดียวจะบันทึกว่า Anthropic ล่ม แล้วประวัติเพี้ยนถาวรย้อนแก้ไม่ได้

**ห้ามมี fallback key ในโค้ดเด็ดขาด** — ไม่มี key = ขึ้นเทา ไม่ใช่แอบใช้ key สำรอง (open-status-page มี key hardcode อยู่ใน public repo ซึ่งเป็นบทเรียนตรงนี้)

### เกณฑ์ latency

| เป้า | เกณฑ์ |
|---|---|
| HTTP / list models | 1,500 ms |
| LLM inference | 3,500 ms |
| เกิน **2 เท่า** ของเกณฑ์ | นับเป็น degraded ทันทีแม้ตอบสำเร็จ |

(ค่าเหล่านี้ยืมจาก open-status-page ซึ่งผ่านสนามจริงมาแล้ว — เก็บใน `components.thresholds` ปรับได้โดยไม่ต้อง deploy)

### สรุปสถานะรายวัน

```
uptime ≥ 98%    → operational   (เผื่อ retry ประปรายที่ไม่ใช่ปัญหาจริง)
uptime 80–98%   → degraded
uptime < 80%    → outage
ไม่มี ping เลย   → no-data
```

---

## 8. Incident

เก็บในตารางเดียว แยกด้วยคอลัมน์ `origin`:

- **`vendor`** — ดูดจาก incident feed ของเจ้านั้นตรงๆ (คำอธิบายเป็นของ vendor เอง)
- **`derived`** — เราตัดสินเอง

`derived` คือตัวที่จับได้ว่า *"gateway ยัง alive แต่ deepseek ตอบไม่ได้มา 20 นาทีแล้ว"* ซึ่งไม่มี vendor คนไหนบอกให้

### กติกา — แก้ปัญหาที่พบใน open-status-page

| ปัญหาของเขา | ของเรา |
|---|---|
| เช็คพลาดครั้งเดียวเปิด incident ทันที → incident ปลอมจาก network hiccup | **3-strike** — fail ติดกัน 3 ครั้งจึงเปิด, ok ติดกัน 3 ครั้งจึงปิด |
| จับคู่ incident ด้วย substring ของชื่อ → เปลี่ยนชื่อแล้วสร้างซ้ำทุกรอบ | ผูกด้วย **`component_id` (FK)** ไม่ใช่ชื่อ |
| ทุกอย่างเขียวแล้วปิด incident ที่เปิดอยู่**ทั้งหมด** รวมอันที่คนเขียนเอง | ปิดเฉพาะ incident ที่ `origin = 'derived'` **ของ component นั้น** |

---

## 9. Realtime

- ใช้ **Broadcast จาก database trigger** ไม่ใช่ Postgres Changes — ประหยัดข้อความกว่ามากเมื่อมีคนดูพร้อมกันหลายคน
- **เพดาน Free:** 200 connection พร้อมกัน / 2 ล้านข้อความต่อเดือน
- **ชนเพดานแล้ว fallback เป็น polling ทุก 30 วินาทีอัตโนมัติ** — หน้าเว็บต้องไม่พัง แค่ช้าลง

---

## 10. ความปลอดภัย

- **RLS:** anon key `SELECT` ได้อย่างเดียวทุกตาราง เขียนได้เฉพาะ `service_role` ที่อยู่ใน Edge Function
- **API key ทั้งหมดอยู่ใน Supabase secrets** ไม่มีทางหลุดถึง browser
- ไม่มีระบบ login ในเฟส 1 — ทุกอย่างเป็น public read
- **ห้าม hardcode key ใดๆ ในซอร์ส** แม้เป็น fallback

---

## 11. UI

SSR หน้าแรกก่อน (เห็นข้อมูลทันทีแม้ JS ยังโหลดไม่เสร็จ) แล้วค่อย subscribe realtime ทับ

> **ทำไม SSR ถึงคุ้ม:** screenshot ของ open-status-page ที่เก็บมาเป็น skeleton เทาทั้งหน้า เพราะเป็น SPA ที่ต้องรอ JS — status page คือหน้าที่คนเปิดตอนกำลังหัวร้อนว่าทำไมโค้ดพัง เจอ skeleton คือแย่ที่สุด

```
┌──────────────────────────────────────────────────┐
│  ● All Systems Operational      อัปเดต 12 วิที่แล้ว │
├──────────────────────────────────────────────────┤
│  9arm Gateway                        ● Operational│
│   ├ deepseek-v4-flash  ● ▇▇▇▇▁▇▇▇▇▇  99.4%  340ms│
│   └ qwen3.8-27b        ● ▇▇▇▇▇▇▇▇▇▇  100%   180ms│
│                                                   │
│  Anthropic                             ◐ Degraded │
│   └ Claude API         ◐ ▇▇▇▇▇▅▇▇▇▇  98.1%  1.2s │
├──────────────────────────────────────────────────┤
│  ช่วงเวลา:  [90 วัน]  6 เดือน  1 ปี  ทั้งหมด       │
├──────────────────────────────────────────────────┤
│  เหตุการณ์ล่าสุด                                   │
│  17 ส.ค. 14:20–14:51 · deepseek-v4-flash · 31 นาที│
│  timeout เกิน 10 วิ ติดกัน 31 ครั้ง                 │
└──────────────────────────────────────────────────┘
```

- **จัดกลุ่ม provider → component ย่อย** พร้อม uptime ต่อกลุ่ม (pattern จาก OpenAI/incident.io)
- **แท่งละ 1 วัน** เป็นเส้นตั้งบางๆ ชิดกันแบบ Claude Status สีตามสถานะแย่สุดของวัน
- วันที่ไม่มีแถว = **ช่องว่างสีจาง** ไม่ใช่เขียว
- ใต้แท่ง: `90 วันก่อน ——— 99.35% uptime ——— วันนี้`
- **คลิกแท่ง** → รายละเอียดวันนั้น (uptime, incident, latency, การเปลี่ยนเวอร์ชันโมเดล)
- **ปุ่มช่วงเวลาทุกอันวาดจาก `daily_rollups` ตารางเดียวกัน** ต่างแค่จำนวนแท่ง → ย้อนไกลกว่า 90 วันได้ฟรี
- **Dark mode เป็นค่าเริ่มต้น** (dashboard เปิดค้างทั้งวันบนจอที่สอง)
- ข้อมูลใหม่เข้าทาง realtime → แถวนั้นกระพริบเบาๆ

**ภาษา:** ไทยเป็นหลัก มีสวิตช์ TH/EN (คนนอกทีมใช้ด้วย)

---

## 12. Error handling

| ปัญหา | วิธีรับมือ |
|---|---|
| fetch ค้าง | **timeout 10 วิทุกเส้น** — open-status-page ไม่มี ทำให้รอบนั้นเสียทั้งรอบ |
| adapter ตัวหนึ่งพัง | `Promise.allSettled` ไม่ใช่ `Promise.all` — ตัวอื่นต้องเช็คต่อได้ |
| network hiccup | retry 1 ครั้งทันทีก่อนตัดสินว่า fail |
| สถานะกระพริบ | 3-strike ก่อนเปิด/ปิด incident |
| เน็ตฝั่งเราสะดุด | สถานะ `unknown` (เทา) ไม่ใช่ down |
| cron ยิงซ้ำ | `collect` ต้อง **idempotent** — rollup ต้องไม่เบิ้ล |
| vendor เปลี่ยนรูปแบบ JSON | adapter ต้อง validate schema ถ้าไม่ตรง → `unknown` + log ไม่ใช่ crash |
| probe เปลืองเงิน | `max_tokens: 1` + kill switch รายโมเดลใน DB |

---

## 13. การทดสอบ

- **Adapter** — มี response จริงของทั้ง 5 แหล่งเก็บไว้แล้วใน `.firecrawl/` (ยิงเมื่อ 2026-08-18) ใช้ทำ fixture ได้เลย เทสได้โดยไม่ต้องต่อเน็ต และรู้ทันทีเมื่อ vendor เปลี่ยนรูปแบบ
- **State machine** — ป้อนลำดับ ok/fail ยืนยันว่าเปิด-ปิด incident ตรงจังหวะ (logic ที่พังง่ายที่สุด)
- **Rollup** — ป้อน sample ชุดหนึ่ง เช็ค uptime% และ histogram
- **Idempotency** — รัน `collect` ซ้ำสองรอบด้วย input เดิม ผลใน DB ต้องเท่าเดิมเป๊ะ
- **Discovery** — จำลองโมเดลเพิ่ม/หาย/เปลี่ยนเวอร์ชัน ยืนยันว่า family คงประวัติต่อเนื่องและของที่หายไม่ถูกลบ
- **Status mapping** — ยืนยันว่า 401 → เทา, 429 → ส้ม, 500 → แดง (กัน false-green กลับมา)
- **Smoke test ตอน deploy** — ยิง `collect` จริง 1 ครั้ง ยืนยันทุก adapter คืนค่าได้

---

## 14. ความเสี่ยงและเรื่องที่ยังค้าง

| เรื่อง | สถานะ |
|---|---|
| **openCode ผิดตัว** | `status.opencode.de` คือแพลตฟอร์ม open source ภาครัฐเยอรมัน (`opencode.de`, `gitlab`, `discourse`, `DevGuard`) **ไม่ใช่ opencode.ai** ที่เป็น AI coding agent — และ `status.opencode.ai` **ไม่มี DNS** ต้องตัดสินใจว่าจะเฝ้าตัวเยอรมัน, เฝ้า opencode.ai ด้วย http-probe, หรือตัดออก |
| ระดับ key ของ 9arm | ยังไม่รู้ — แก้ด้วย capability detection แล้ว |
| 9arm รองรับ OpenAI API surface ไหม | โค้ดที่เห็นใช้ Anthropic surface ต้องยืนยันตอน implement |
| Google AI Studio | `aistudio.google.com/status` เป็น SPA ไม่มี JSON — ใช้ `status.cloud.google.com/incidents.json` แทน ต้องยืนยันว่าครอบคลุม Gemini API จริง |
| ชน 200 realtime connections | มี fallback polling แล้ว ถ้าโตกว่านั้นค่อยพิจารณา Pro |

---

## 15. ความสัมพันธ์กับ open-status-page

[`pakorn269/open-status-page`](https://github.com/pakorn269/open-status-page) ทำ status page ของ 9arm gateway อยู่แล้ว (Vite + React + Supabase + Cloudflare Workers)

**สิ่งที่ยืมมา:** เกณฑ์ตัดสินสถานะรายวัน (98/80), เกณฑ์ latency (1500/3500 ms), แนวคิด probe จริงรายโมเดล, สถาปัตยกรรม `pg_cron` + `pg_net` → Edge Function (คิดตรงกันโดยบังเอิญ = ยืนยันว่าถูกทาง)

**สิ่งที่ทำต่างและทำไม:** เก็บแบบ rollup แทน raw log (เขาจะชน 500 MB), แยก 401/429 ออกจาก operational (เขา false-green), 3-strike, ผูก incident ด้วย FK, timeout, SSR, auto-discovery, family/variant, หลาย provider

**ข้อควรระวัง:** repo นั้นมี API key ของ gateway hardcode เป็น fallback อยู่ในซอร์สสาธารณะ — ไม่นำมาใช้ และ spec นี้ห้าม fallback key โดยเด็ดขาด

---

## 16. อ้างอิงที่เก็บไว้แล้ว

`.firecrawl/` — markdown 5 ไฟล์ + screenshot 2 ไฟล์ (Claude Status, open-status-page) เก็บเมื่อ 2026-08-18 ใช้เป็น fixture และ design reference
