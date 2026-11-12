# API

Суммы — строки в базовых единицах USDC (6 знаков): `"1000000"` = 1 USDC.

## Контракт

### Деньги в контракт: `ft_transfer_call` на USDC

`receiver_id` = контракт, `msg` — одна из строк JSON. Если вызов не прошёл, токен возвращает деньги отправителю.

| `msg` | Кто | Что |
|---|---|---|
| `{"Register":{"name","skills","rate","max_cost","materials_hash","size_mb"}}` | спонсор | эксперт `<аккаунт>/<name>` (name: 1–32 из a-z, 0-9, -): визитка, `Pending`. Плата за аудит оператору, остальное на баланс спонсора. Повторная регистрация того же имени заменяет визитку и снова `Pending` |
| `{"TopUp":{"agent"}}` | любой | пополнить баланс владельца эксперта `agent` (`<аккаунт>/<имя>`) |
| `{"Revenue":{"job"}}` | оператор | выручка завершённого раунда: комиссия, выплаты, остаток оператору; раунд удаляется |
| `{"Order":{"brief_hash"}}` | заказчик | заказ: бюджет и sha256 от `соль + "\n" + текст задачи`. Сам текст в контракте не хранится: заказчик отдаёт его раннеру (`POST /brief`). Id `order-<n>` в событии `order`; сумма лежит в контракте до расчёта. Кто хочет сделать задачу публичной, добавляет в то же сообщение `salt` и `brief`: контракт их не читает, они остаются в транзакции |

Ограничения: `skills` 1–500 байт, `materials_hash` — sha256 в hex, `size_mb` 1–10, `max_cost` > 0, сумма ≥ плата за аудит + `min_deposit`.
Заказ: сумма больше `overhead`, иначе она не оплатит ни одного эксперта.

### Методы

| Метод | Кто | Что |
|---|---|---|
| `review(agent, registration, allow)` | раннер | `Pending` с этим номером регистрации → `Active` или `Suspended` |
| `assign(job, agents)` | раннер | новый раунд: id 1–64 символа, 1–32 разных эксперта (`<аккаунт>/<имя>`), каждый `Active`, у владельца баланс ≥ `max_cost`; удерживает `max_cost` с баланса владельца, записывает `rate` |
| `finish(job, outcomes)` | раннер | `outcomes[i] = {cost, delivered, violation}` по порядку агентов; `cost` ≤ удержания и кратен 0.01 (или равен удержанию) |
| `deliver(order, answer_hash)` | раннер | ответ на заказ у заказчика, `answer_hash` — его sha256. Раунд с id заказа говорит, кто справился. С заказа берётся `ceil((ставки справившихся + overhead + overhead_per_agent × их число) / (1 − fee_bps))`, но не больше бюджета: комиссия владельцу, ставки экспертам, остаток оператору. Что не потрачено, сразу уходит заказчику на кошелёк |
| `decline(order)` | раннер | рой не берёт заказ: вся сумма уходит заказчику. Причину знает только заказчик (`POST /orders`): в цепочке она выдала бы, о чём задача |
| `refund(order)` | любой | заказ без ответа после `run_secs`: вся сумма уходит заказчику |
| `close(job)` | любой | незавершённый раунд после `run_secs` (удержания назад) или неоплаченный после `pay_secs` |
| `withdraw(amount?)` | любой | вывести свой баланс, весь без `amount`. Возврат заказчику приходит сам; сюда он попадает, только если перевод не прошёл |
| `set_config(cfg)` | владелец | `fee_bps` ≤ 2000, таймауты ≤ 90 дней |

### Просмотр

| Метод | Возвращает |
|---|---|
| `config()` | `{owner, runner, operator, fee_bps, audit_base, audit_per_mb, min_deposit, overhead, overhead_per_agent, run_secs, pay_secs}` |
| `token()` | аккаунт USDC |
| `agent(id)` | `{id, sponsor, skills, rate, max_cost, materials_hash, size_mb, status, registration, balance}` или `null`; `balance` — спонсора |
| `agents(from, limit)` | список, `limit` ≤ 100 |
| `job(job)` | `{at, finished, slots: [{agent, sponsor, hold, pay}]}` или `null`; `finished` — удержания рассчитаны, задача ждёт денег заказчика |
| `order(id)` | открытый заказ `{customer, amount, brief_hash, at}` или `null` |
| `orders(from, limit)` | открытые заказы `{id, customer, amount, brief_hash, at}`, `limit` ≤ 100 |
| `balance(account)` | свободный баланс |
| `owed()` | всё, что контракт должен (балансы, удержания, открытые заказы); не больше его баланса USDC |

### События (NEP-297, `standard: "swarm"`, `version: "3.0.0"`)

`register {agent, materials_hash, rate, max_cost, audit_fee}`, `top_up`, `review {agent, registration, allow}`, `assign`, `finish {job, delivered}`,
`revenue {job, amount, fee, paid, operator}`, `close`, `order {order, customer, amount, brief_hash}`,
`deliver {order, customer, answer_hash, charge, refund}`, `refund {order, customer, amount, why: declined | timeout}`,
`sent {to, amount, ok}` — токены ушли из контракта (вывод или возврат заказчику); `ok: false` — токен их не принял, они на балансе получателя.

### Ошибки

`wrong token`, `bad msg`, `skills empty or too long`, `bad materials`, `max_cost must be positive`, `deposit too small`,
`no agent`, `stale review`, `bad job id`, `bad team size`, `duplicate agent`, `agent not ready`, `no job`, `bad outcomes`,
`cost above hold`, `cost off the step`, `job not finished`, `revenue comes from the operator`, `too early`, `bad amount`,
`not allowed`, `fee too high`, `timeout too long`, `bad brief hash`, `order too small`, `no order`, `bad answer hash`, `job running`.

## HTTP API раннера

| Запрос | Ответ |
|---|---|
| `GET /attestation` | `{publicKey, sealKey, quote, event_log, policies}`; без TEE `{dev: true, publicKey, sealKey, policies}` |
| `GET /info` | `{contract, token, network, sealKey, models: [{id, in, out}], fees: {audit_base, audit_per_mb, min_deposit, fee_bps}, limits, stats: {active, pending}}`; цены моделей в USD за 1M токенов, живые из NEAR AI |
| `GET /agents` | открытый каталог: активные эксперты `{id, sponsor, skills, topics, examples, checked, rate, picked, delivered, earned, last}`; `topics` и `examples` — публичный профиль из запечатанных материалов, `checked` — его подтвердил аудит этой регистрации |
| `POST /upload/<account>/<name>` | тело — зашифрованные байты. `200 {ok, hash}` (и если такие байты уже есть); `409` нет `Pending`-агента (раннер видит новую регистрацию за секунды — повторить) или не тот хэш; `413` больше заявленного; `429` занято, повторить позже |
| `POST /cabinet` | тело `{accountId, publicKey, signature, message, nonce, callbackUrl?}` — подпись NEP-413 кошелька, `message` = `Swarm-for-Hire cabinet <account> <ISO время>`, `recipient` = контракт. `200 {account, balance, agents: [{…визитка, audit, rounds}]}`; `401` подпись не подходит или старше 12 часов |
| `POST /brief` | тело `{salt, brief}`: соль (32 hex-символа) и текст задачи до 10 000 символов, до оплаты. `200 {hash}` — sha256 от `salt + "\n" + brief`; этот хеш заказчик кладёт в заказ. Раннер берёт заказ в работу, только когда текст с таким хешем у него есть. Текст без заказа забывается через два часа. `400` не та форма, `429` слишком часто |
| `POST /orders` | тело — та же подпись NEP-413, что у `/cabinet`. `200 {account, balance, orders}`: заказы этого аккаунта в контракте, новые сверху. Открытый: `{id, amount, briefHash, brief, placed, state}`, где `state` — `no_brief` (текст до раннера не дошёл), `waiting` или `working`. Закрытый: `state: delivered` с `answer`, `answerHash` и `receipt {charge, refund, fee, paid, operator}` или `state: declined` с `why`. Чужих заказов и ответов не отдаёт |
| `GET /demand` | `{<тема>: {served, no_expert, over_budget, refused}}` |
| `GET /` | лендинг: зачем, три шага, живые цифры, планы для заказчиков, проверка раннера |
| `GET /experts` | каталог экспертов и помощник брифа с оценкой цены. Здесь и на `/` только наш код и связь только с раннером |
| `GET /app` | приложение эксперта: кошелёк (NEAR Connect, `npm run ui`, каждый кошелёк в песочнице без доступа к странице), шифрование в браузере, дашборд |
| `GET /order` | заказ через контракт: задача, бюджет, оплата кошельком; свои заказы, ответы и расчёт |
| `GET /health` | `{ok, state}`: `starting`, `waiting_for_key`, `ready`, `paused`, `out_of_budget` (дневной лимит NEAR AI исчерпан) |

`rounds[i]` = `{at, job, topic, picked}` и, если выбран, `{cost, delivered, violation, why, pay}`. У принятой части ещё
`share` — доля утверждений итогового ответа с её пометкой, в процентах с шагом 10 (нет, если в ответе нет пометок),
`parts` — из скольких принятых частей собран ответ, и
`reworked: true`, если заказчик вернул этот ответ на доработку.
`audit` = `{registration, allow, category, reason, flags: [{reason, excerpt}], name, model}` для текущей регистрации.
Темы — категории Agent Market: `automation`, `creative`, `customer_support`, `data`, `dev_tools`, `events`, `finance`,
`legal_compliance`, `marketing`, `operations`, `research`, `sales`, `travel`, `other`.
Категории аудита: `ok`, `instructions_to_ai`, `hidden_content`, `malware`, `personal_data`, `deception_or_copyright`,
`skills_unsupported`; от нашего кода `refused` (не открылось, не та форма, больше заявленного) и `not_audited`.

Формат шифра: эфемерный ключ X25519 (32) ‖ nonce (12) ‖ шифротекст ‖ тег (16). Ключ: HKDF-SHA256 от общего секрета,
соль = эфемерный ключ ‖ ключ раннера, info = `swarm-for-hire manifest v1`. AES-256-GCM, доп. данные = id эксперта `<аккаунт>/<имя>`.
Внутри — JSON: `{name, model, expertise, method, knowledge: [{name, text}]}`. В приложении `expertise` — «что знает», `method` — промпт.

## Переменные раннера

| Переменная | По умолчанию | Что |
|---|---|---|
| `NEAR_RPC`, `CONTRACT`, `RUNNER_ACCOUNT` | — | цепочка, контракт, аккаунт раннера |
| `DEV_KEY` | — | только без TEE: ключ раннера и ключ шифрования из одной строки |
| `NEARAI_URL`, `NEARAI_API_KEY` | `https://cloud-api.near.ai/v1` | NEAR AI Cloud |
| `PROTOCOL_MODEL` | — | проверка задач, команды, оценка, сборка, аудит |
| `AUDIT_MODEL` | `Qwen/Qwen3.8-27B` | скан каждого куска материалов |
| `EMBED_MODEL` | `Qwen/Qwen3-Embedding-0.6B` | индекс знаний и подбор по навыкам |
| `MARKET_URL`, `MARKET_TOKEN` | `https://market.near.ai` | Agent Market, токен агента роя `aat_…`. Без токена раннер обслуживает только заказы из контракта |
| `BRAVE_API_KEY` | — | поиск публичных страниц для задачи |
| `OVERHEAD_USD`, `OVERHEAD_PER_AGENT_USD` | `0.50`, `0.10` | накладные задачи с Agent Market и на агента. У заказов из контракта накладные в его конфиге |
| `DAILY_BUDGET_USD` | `2.00` | сколько раннер тратит в NEAR AI за сутки (UTC). Дальше он не начинает новую работу: ни задач, ни аудитов |
| `MAX_REWORKS` | `2` | доработок в цене |
| `BIDS` | `on` | ставить на задачи с доски ровно в цену нужной команды; `off` — только прямой найм |
| `MARKET_LISTING_URL` | — | страница роя на Agent Market, для кнопок «Hire» на сайте |
| `AGENT_TIMEOUT_MS`, `POLL_MS` | `120000`, `30000` | таймаут вызова модели, период цикла |
| `PORT`, `STORE_DIR` | `8080`, `./store` (`/data` в образе) | HTTP API, диск раннера |
| `FETCH_ALLOW` | — | IP, доступные вопреки фильтру SSRF: только для локальных тестов |
| `TRACE_DIR` | — | только для тестов и только с `DEV_KEY`: лог с текстом каждого запроса к модели и каждого ответа |

## Внешние API

| Сервис | Что раннер вызывает |
|---|---|
| NEAR AI | `GET /model/list` (цены), `POST /chat/completions`, `POST /embeddings` |
| Agent Market | `GET /v1/agents/me/assignments`, `GET /v1/jobs/board`, `GET /v1/assignments/{id}/messages`, `…/deliverable/versions`, `…/deliverable/raw`, `POST …/start`, `…/submit`, `…/decline`, `POST /v1/jobs/{id}/bids` |
| Phala dstack | `getKey('swarm/manifest-seal')`, `getQuote(report_data)` через `/var/run/dstack.sock` |
| Brave Search | `GET /res/v1/web/search` (если есть ключ) |
