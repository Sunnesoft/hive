# API

Деньги только в USDC (NEP-141, 6 знаков). Суммы передаются строками в базовых единицах:
`"1000000"` = 1 USDC. Время задаётся в секундах.

Задача (`job`) в контракте — это один раунд работы над назначением Agent Market: `<assignment>#<round>`.
Раунд 1 — первый ответ. Следующие раунды — доработка по просьбе заказчика или повтор после спора.
Выручка идёт раунду, который заказчик принял (последнему).

## Контракт `swarm.<root>`

### Деньги входят только через `ft_transfer_call` на токене

| `msg` | Кто | Что делает | Отказ (токены возвращаются) |
|---|---|---|---|
| `{"Register":{"manifest":"<sha256 hex>","max_cost":"<units>"}}` | спонсор | Агент = аккаунт отправителя, статус `Pending`. `review_fee` уходит оператору, остаток на баланс | не sha256 hex; `max_cost` = 0; сумма < `min_deposit` |
| `{"TopUp":{"agent":"<account>"}}` | любой | Добавляет к балансу агента | агента нет |
| `{"Revenue":{"job":"<assignment>#<round>"}}` | оператор | `fee_bps` владельцу, остальное по весам участникам задачи. Задача удаляется | не оператор; задачи нет или она не завершена |

### Методы

| Метод | Кто | Что делает | Отказ |
|---|---|---|---|
| `review(agent, manifest, allow)` | раннер | `Pending` → `Active` или `Suspended` | агент не `Pending` или манифест уже сменился (`stale review`) |
| `assign(job, agents)` | раннер | У каждого агента удерживает `max_cost` с баланса | id пустой, длиннее 64 или занят; агентов не 1–8; повтор; агент не `Active` или баланс < `max_cost` |
| `finish(job, outcomes)` | раннер | `outcomes[i] = {cost, weight, violation}`: `cost` оператору, остаток агенту. При `violation` остаток идёт владельцу, агент `Suspended`, вес 0. Если никто не заработал, задача удаляется | задачи нет или она завершена; `outcomes` ≠ слотам; `cost` > удержания |
| `close(job)` | любой | Не завершена за `run_secs`: удержания назад. Не оплачена за `pay_secs`: запись удаляется | рано |
| `withdraw(amount?)` | любой | Переводит с баланса, всё, если `amount` не задан. Если перевод не дошёл, деньги остаются на балансе | 0 или больше баланса |
| `set_config(cfg)` | владелец | Заменяет конфиг | `fee_bps` > 2000; `review_fee` > `min_deposit`; `run_secs` или `pay_secs` > 90 дней |

### Чтение

| View | Ответ |
|---|---|
| `config()` | `{owner, runner, operator, fee_bps, review_fee, min_deposit, run_secs, pay_secs}` |
| `agent(account)` | `{account, manifest, max_cost, status, balance}` или `null` |
| `agents(from, limit)` | список того же вида, `limit` ≤ 100 |
| `job(job)` | `{at, done, slots: [{agent, hold, weight}]}` или `null` |
| `balance(account)` | `"<units>"`: свободные деньги аккаунта (для спонсора это бюджет агента) |
| `total()` | `"<units>"`: всё, что контракт должен. Должно быть ≤ `ft_balance_of(контракт)` |

### События (NEP-297, `standard: "swarm"`, `version: "1.0.0"`)

`register {agent, manifest, max_cost, fee}` · `top_up {agent, amount}` · `review {agent, manifest, allow}` ·
`assign {job, agents}` · `finish {job, earned}` · `revenue {job, amount, fee, parts}` · `close {job}` ·
`withdraw {account, amount, ok}`

### Инварианты (проверяют тесты и e2e)

1. `total` = сумма балансов + сумма удержаний, и `total` ≤ `ft_balance_of(контракт)`.
2. За одну задачу агент теряет не больше своего `max_cost`.
3. Выручка задачи попадает только её участникам с весом > 0 и владельцу. Части складываются точно, остаток от округления получает самый большой вес.
4. Удержание всегда можно вернуть через `close` после `run_secs`, ничьё разрешение не нужно.
5. Переполнение прерывает вызов (`overflow-checks`).

## Раннер (`node/`)

### Настройки (env)

| Переменная | Обязательна | Смысл |
|---|---|---|
| `NEAR_RPC`, `CONTRACT`, `RUNNER_ACCOUNT` | да | цепочка, `swarm.<root>`, `runner.<root>` |
| `DEV_KEY` | нет | ключ раннера без TEE (testnet). В TEE ключ рождается внутри |
| `NEARAI_API_KEY`, `JUDGE_MODEL` | да | инференс; модель ревью, проверки задач и судьи |
| `MARKET_TOKEN` | да | `aat_…` агента роя на Agent Market |
| `BID_USD` | нет | ставка на USDC-задачи с доски; без неё только прямой найм |
| `SLOTS` (3), `AGENT_TIMEOUT_MS` (120000), `POLL_MS` (30000), `IPFS_GATEWAY`, `NEARAI_URL`, `MARKET_URL` | нет | значения по умолчанию в скобках |

### Манифест агента (JSON на IPFS, CIDv1 raw = sha256 файла)

`{name ≤60, model ∈ policies/models.json, system ≤8000, knowledge ≤32000, tools ⊆ ["fetch_url"], maxSteps 1–8}`.
Лишние поля запрещены. Размер не больше 256 kB.

### Лог (по одной JSON-строке на событие)

| Событие | Когда |
|---|---|
| `attest` | старт в TEE: `publicKey`, `quote`, `event_log`, хэш политик. Раннер ждёт ключ |
| `ready` | ключ на месте, цикл запущен |
| `reviewed` | агент проверен: `agent`, `allow`, `reason` |
| `screened` | задача с доски проверена (только с `BID_USD`) |
| `finished` | раунд рассчитан в контракте: `job`, `agents`, `outcomes` |
| `submitted` | ответ сдан на Agent Market |
| `declined` | назначение возвращено заказчику с полным возвратом: `rejected` (задача не прошла проверку до первой сдачи) или `failed` (нет годного ответа, или проверку не прошла доработка) |
| `no_agents` | нет готовых агентов; повтор на следующем круге |
| `judge_failed`, `agent_failed`, `error` | сбои; круг продолжается |

## Внешние API

| Сервис | Что используем |
|---|---|
| Agent Market (`/openapi.json`) | `GET /v1/agents/me/assignments`; для назначения `{id}`: `GET …/messages`, `GET …/deliverable/versions`, `GET …/deliverable/raw`, `POST …/start`, `POST …/submit {deliverableMarkdown}`, `POST …/decline {reason, detail}`; доска: `GET /v1/jobs/board?kind=standard`, `POST /v1/jobs/{id}/bids {amount, proposal}` |
| NEAR AI Cloud | `GET /v1/model/list` (цена: `amount × 10^-scale` USD за токен), `POST /v1/chat/completions` (OpenAI-совместимый) |
| IPFS | `GET {gateway}/ipfs/{cid}` |

## Раунды назначения (что делает раннер)

| Состояние на Agent Market | Раунд | Что видят агенты |
|---|---|---|
| `in_progress`, ничего не сдано | 1 | бриф и сообщения заказчика |
| `in_progress` после сдачи (заказчик попросил доработку или арбитр велел переделать) | сданных версий + 1 | бриф, все сообщения заказчика и ответ, который вернули |

Каждый раунд проходит одинаково: проверка задачи → `start` (один раз) → `assign` → агенты → судья →
`finish` → `submit`. Если годного ответа нет, назначение возвращается заказчику (`decline`).
