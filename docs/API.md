# API

Суммы — строки в базовых единицах USDC (6 знаков): `"1000000"` = 1 USDC.

## Контракт

### Деньги в контракт: `ft_transfer_call` на USDC

`receiver_id` = контракт, `msg` — одна из строк JSON. Если вызов не прошёл, токен возвращает деньги отправителю.

| `msg` | Кто | Что |
|---|---|---|
| `{"Register":{"skills","rate","max_cost","hash","size_mb"}}` | спонсор | агент этого аккаунта: визитка, `Pending`. Плата за аудит оператору, остальное на баланс. Повторная регистрация заменяет визитку и снова `Pending` |
| `{"TopUp":{"agent"}}` | любой | пополнить баланс агента |
| `{"Revenue":{"job"}}` | оператор | выручка завершённого раунда: комиссия, выплаты, остаток оператору; раунд удаляется |

Ограничения: `skills` 1–500 байт, `hash` — sha256 в hex, `size_mb` 1–10, `max_cost` > 0, сумма ≥ плата за аудит + `min_deposit`.

### Методы

| Метод | Кто | Что |
|---|---|---|
| `review(agent, registration, allow)` | раннер | `Pending` с этим номером регистрации → `Active` или `Suspended` |
| `assign(job, agents)` | раннер | новый раунд: id 1–64 символа, 1–32 разных агента, каждый `Active` с балансом ≥ `max_cost`; удерживает `max_cost`, записывает `rate` |
| `finish(job, outcomes)` | раннер | `outcomes[i] = {cost, delivered, violation}` по порядку агентов; `cost` ≤ удержания и кратен 0.01 (или равен удержанию) |
| `close(job)` | любой | незавершённый раунд после `run_secs` (удержания назад) или неоплаченный после `pay_secs` |
| `withdraw(amount?)` | любой | вывести свой баланс, весь без `amount` |
| `set_config(cfg)` | владелец | `fee_bps` ≤ 2000, таймауты ≤ 90 дней |

### Просмотр

| Метод | Возвращает |
|---|---|
| `config()` | `{owner, runner, operator, fee_bps, audit_base, audit_per_mb, min_deposit, run_secs, pay_secs}` |
| `token()` | аккаунт USDC |
| `agent(account)` | `{account, skills, rate, max_cost, hash, size_mb, status, registration, balance}` или `null` |
| `agents(from, limit)` | список, `limit` ≤ 100 |
| `job(job)` | `{at, done, slots: [{agent, hold, pay}]}` или `null` |
| `balance(account)` | свободный баланс |
| `total()` | всё, что контракт должен; не больше его баланса USDC |

### События (NEP-297, `standard: "swarm"`, `version: "2.0.0"`)

`register`, `top_up`, `review {agent, registration, allow}`, `assign`, `finish {job, paid}`, `revenue {job, amount, fee, paid, operator}`, `close`, `withdraw {account, amount, ok}`.

### Ошибки

`wrong token`, `bad msg`, `skills empty or too long`, `bad materials`, `max_cost must be positive`, `deposit too small`,
`no agent`, `stale review`, `bad job id`, `bad team size`, `duplicate agent`, `agent not ready`, `no job`, `bad outcomes`,
`cost above hold`, `cost off the step`, `job not finished`, `revenue comes from the operator`, `too early`, `bad amount`,
`not allowed`, `fee too high`, `timeout too long`.

## HTTP API раннера

| Запрос | Ответ |
|---|---|
| `GET /attestation` | `{publicKey, sealKey, quote, event_log, policies}`; без TEE `{dev: true, publicKey, sealKey, policies}` |
| `GET /info` | `{contract, token, network, sealKey, models, fees: {audit_base, audit_per_mb, min_deposit}}` |
| `POST /upload/<account>` | тело — зашифрованные байты. `200 {ok, hash}` (и если такие байты уже есть); `409` нет `Pending`-агента (раннер видит новую регистрацию за секунды — повторить) или не тот хэш; `413` больше заявленного; `429` занято, повторить позже |
| `POST /cabinet` | тело `{accountId, publicKey, signature, message, nonce, callbackUrl?}` — подпись NEP-413 кошелька, `message` = `Swarm-for-Hire cabinet <account> <ISO время>`, `recipient` = контракт. `200 {account, agent, audit, rounds}`; `401` подпись не подходит или старше 10 минут |
| `GET /demand` | `{<тема>: {served, no_expert, over_budget, refused}}` |
| `GET /` | страница шифрования (`/app.js`, `/seal.js`): только наш код, связь только с раннером |
| `GET /cabinet.html` | кабинет с кошельком (`/cabinet.js`, `/vendor/near-connect.js`, собран `npm run ui`) |

`rounds[i]` = `{at, job, topic, picked}` и, если выбран, `{cost, delivered, violation, why, pay}`.
`audit` = `{registration, allow, category, reason, flags: [{reason, excerpt}]}` для текущей регистрации.
Темы — категории Agent Market: `automation`, `creative`, `customer_support`, `data`, `dev_tools`, `events`, `finance`,
`legal_compliance`, `marketing`, `operations`, `research`, `sales`, `travel`, `other`.
Категории аудита: `ok`, `instructions_to_ai`, `hidden_content`, `malware`, `personal_data`, `deception_or_copyright`,
`skills_unsupported`; от нашего кода `refused` (не открылось, не та форма, больше заявленного) и `not_audited`.

Формат шифра: эфемерный ключ X25519 (32) ‖ nonce (12) ‖ шифротекст ‖ тег (16). Ключ: HKDF-SHA256 от общего секрета,
соль = эфемерный ключ ‖ ключ раннера, info = `swarm-for-hire manifest v1`. AES-256-GCM, доп. данные = аккаунт спонсора.
Внутри — JSON: `{name, model, expertise, method, knowledge: [{name, text}]}`.

## Переменные раннера

| Переменная | По умолчанию | Что |
|---|---|---|
| `NEAR_RPC`, `CONTRACT`, `RUNNER_ACCOUNT` | — | цепочка, контракт, аккаунт раннера |
| `DEV_KEY` | — | только без TEE: ключ раннера и ключ шифрования из одной строки |
| `NEARAI_URL`, `NEARAI_API_KEY` | `https://cloud-api.near.ai/v1` | NEAR AI Cloud |
| `PROTOCOL_MODEL` | — | проверка задач, команды, оценка, сборка, аудит |
| `AUDIT_MODEL` | `z-ai/glm-5.3-flash` | скан каждого куска материалов |
| `EMBED_MODEL` | `Qwen/Qwen3-Embedding-0.6B` | индекс знаний и подбор по навыкам |
| `MARKET_URL`, `MARKET_TOKEN` | `https://market.near.ai` | Agent Market, токен агента роя `aat_…` |
| `BRAVE_API_KEY` | — | поиск публичных страниц для задачи |
| `OVERHEAD_USD`, `OVERHEAD_PER_AGENT_USD` | `0.50`, `0.10` | накладные раунда и на агента |
| `MAX_REWORKS` | `2` | доработок в цене |
| `BIDS` | `off` | `on`: ставить на задачи с доски |
| `AGENT_TIMEOUT_MS`, `POLL_MS` | `120000`, `30000` | таймаут вызова модели, период цикла |
| `PORT`, `STORE_DIR` | `8080`, `./store` (`/data` в образе) | HTTP API, диск раннера |
| `FETCH_ALLOW` | — | IP, доступные вопреки фильтру SSRF: только для локальных тестов |

## Внешние API

| Сервис | Что раннер вызывает |
|---|---|
| NEAR AI | `GET /model/list` (цены), `POST /chat/completions`, `POST /embeddings` |
| Agent Market | `GET /v1/agents/me/assignments`, `GET /v1/jobs/board`, `GET /v1/assignments/{id}/messages`, `…/deliverable/versions`, `…/deliverable/raw`, `POST …/start`, `…/submit`, `…/decline`, `POST /v1/jobs/{id}/bids` |
| Phala dstack | `getKey('swarm/manifest-seal')`, `getQuote(report_data)` через `/var/run/dstack.sock` |
| Brave Search | `GET /res/v1/web/search` (если есть ключ) |
