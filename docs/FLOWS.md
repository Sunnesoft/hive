# Взаимодействия: кто, что, кому, когда и по какому каналу

Та же страница с картинками в SVG: `docs/flows/FLOWS.md`. Пересобрать картинки: `scripts/diagrams.sh`.

Главное правило: **агент — не процесс, а данные.** У агента нет своего сервера и своих ключей. Агент — это
зашифрованный манифест в контракте; «агент работает» значит: раннер в TEE открыл манифест и вызвал модель
NEAR AI с промптом и знаниями этого агента.

## 0. Карта

```mermaid
flowchart TB
  subgraph People["Люди"]
    direction LR
    C["Заказчик"]
    S["Спонсор"]
    O["Владелец"]
    P["Оператор"]
  end
  subgraph Off["Сервисы вне цепочки"]
    direction LR
    M["Agent Market"]
    subgraph TEE["Phala CVM, Intel TDX"]
      R["Раннер"]
      D["dstack"]
    end
    L["NEAR AI, модели в TEE"]
    W["Публичный веб"]
  end
  subgraph Chain["NEAR"]
    direction LR
    T["Токен USDC"]
    K["Контракт swarm"]
    RA["Аккаунт runner"]
  end

  C -- "задача, приёмка, спор" --> M
  M -- "выплата" --> P
  R -- "назначения, переписка, сдача" --> M
  R -- "ключ, quote" --> D
  R -- "промпты, цены" --> L
  R -- "fetch_url через SSRF-фильтр" --> W
  R -- "чтение и 3 метода" --> K
  R -. "лог attest с quote" .-> O
  S -- "Register, TopUp" --> T
  P -- "Revenue" --> T
  S -- "withdraw" --> K
  P -- "withdraw" --> K
  O -- "deploy, set_config" --> K
  O -- "AddKey" --> RA
  T <-- "ft_on_transfer, ft_transfer" --> K
```

## 1. Акторы и ответственность

| Актор | Где живёт | Отвечает за | Ключи | Не может |
|---|---|---|---|---|
| Заказчик | Agent Market | задачу, оплату в эскроу, приёмку, замечания, спор | свои на рынке | ничего в нашем контракте |
| Спонсор | свой NEAR-аккаунт | манифест (промпт, знания, навыки), бюджет на инференс, потолок за задачу | full-access своего аккаунта | видеть чужие манифесты, задачи и ответы других агентов |
| Владелец | `ROOT` | деплой, конфиг, проверку quote, ключ раннера, паузу | full-access `ROOT`, `swarm.*`, `runner.*` | забрать балансы одним вызовом, прочитать манифесты текущим кодом |
| Оператор | `operator.ROOT` и аккаунт на Agent Market | оплату NEAR AI, приём выплат рынка, пересылку выручки | `operator.*`, `MARKET_TOKEN`, `NEARAI_API_KEY` | списывать балансы, читать манифесты |
| Раннер | Phala CVM (TEE) | всю работу: ревью, проверку задач, вопросы агентам, запуск, сборку ответа, расчёт | ключ подписи (новый на каждый старт), ключ печати (стабильный), оба только в TEE | двигать деньги кроме `review`, `assign`, `finish`; списать больше удержания |
| Модель протокола | NEAR AI, `PROTOCOL_MODEL` | ревью манифеста, проверку задачи, маршрутизацию, сборку ответа и оценку вклада | — | что-то делать сама: только отвечает раннеру |
| Контракт `swarm.*` | NEAR | деньги и их правила, хранение зашифрованных манифестов | — | судить качество, видеть содержимое манифестов |
| Agent Market | market.near.ai | эскроу, приёмку, споры, выплату | — | видеть агентов роя: для рынка рой — один агент |
| Любой | — | `close` зависшей задачи, `status` | — | — |

## 2. Каналы

| Канал | Между кем | Доступ | Формат | Кто начинает |
|---|---|---|---|---|
| HTTP `GET /attestation` | кто угодно → раннер | нет: содержимое доказывает себя подписью Intel | JSON: ключи, quote, журнал событий | владелец, спонсор |
| Транзакция NEAR | спонсор, оператор, владелец → токен или контракт | подпись аккаунта | JSON-аргументы метода | человек через `swarm.sh` |
| Транзакция NEAR | раннер → контракт | function-call ключ на `review`, `assign`, `finish` | JSON-аргументы | раннер |
| Квитанции между контрактами | токен ↔ контракт | система NEAR | `ft_on_transfer`, `ft_transfer`, `on_withdraw` | токен или контракт |
| RPC, чтение | раннер, скрипты → контракт | без подписи | JSON | читающий |
| HTTPS | раннер → Agent Market | `Bearer aat_…` | JSON REST, ответ заказчику — Markdown | раннер (опрос) |
| HTTPS | раннер → NEAR AI | `Bearer sk-…` | OpenAI chat completions | раннер |
| HTTPS | раннер → публичный веб | нет | GET, текст страницы | агент через инструмент `fetch_url` |
| Unix-сокет | раннер → dstack | только изнутри CVM | `getKey`, `getQuote` | раннер на старте |
| Лог | раннер → владелец и оператор | панель Phala | одна JSON-строка на событие | раннер |
| Веб | заказчик, оператор ↔ Agent Market | свой вход | интерфейс рынка | человек |

## 3. Кто что видит

`✓` — видит, `—` — не видит, `ответ` — видит только то, что попало в итоговый ответ.

| Данные | Спонсор-автор | Другие спонсоры | Владелец, оператор | Раннер (TEE) | NEAR AI (TEE) | Цепочка (все) | Заказчик |
|---|---|---|---|---|---|---|---|
| Манифест в открытом виде (промпт, знания) | ✓ | — | — | ✓ в памяти | ✓ при ревью и при каждом вызове агента | — | ответ |
| Навыки (`skills`) | ✓ | — | — | ✓ | ✓ при маршрутизации | — | — |
| Библиотека (большая база) | ✓ | — | — | ✓ в памяти | ✓ все куски при индексации, ближайшие в промпте | — (хостинг видит шифротекст) | ответ |
| Ссылка на библиотеку и её хэш | ✓ | — | — | ✓ | — | — | — |
| Зашифрованный манифест и его хэш | ✓ | ✓ | ✓ | ✓ | — | ✓ | — |
| Секрет ключа печати | — | — | — | ✓ | — | — | — |
| `seal_key` (публичный) | ✓ | ✓ | ✓ | ✓ | — | ✓ | — |
| Задача и сообщения заказчика | — | — | — | ✓ | ✓ | — | ✓ |
| Вопрос агенту | — | — | — | ✓ | ✓ | — | — |
| Ответ агента (вклад) | — | — | — | ✓ | ✓ при сборке | — | ответ |
| Итоговый ответ | — | — | — | ✓ | ✓ | — | ✓ |
| Стоимость и вклад агента | ✓ | ✓ | ✓ | ✓ | — | ✓ | — |
| Деньги, балансы | ✓ | ✓ | ✓ | ✓ | — | ✓ | — |

Агенты не видят друг друга: ни вопросов, ни ответов, ни прошлого ответа на доработке.
В логах раннера нет ни манифестов, ни задач, ни ответов: только аккаунты, решения, стоимость и веса.

## 4. Запуск раннера и аттестация

Когда: при деплое и после каждого перезапуска CVM.

```mermaid
sequenceDiagram
  autonumber
  actor O as Владелец
  participant K as Контракт swarm
  participant RA as Аккаунт runner
  participant Ph as Phala Cloud
  participant R as Раннер в CVM
  participant D as dstack
  O->>K: deploy и new(token, cfg), seal_key пока пустой
  O->>Ph: docker-compose.yml с образом по дайджесту, секреты NEARAI_API_KEY и MARKET_TOKEN
  Ph->>R: запуск контейнера
  R->>D: getKey("swarm/manifest-seal")
  D-->>R: 32 байта, выведены из идентичности приложения
  Note over R: секрет печати = sha256(key), sealKey = его публичная X25519-половина.<br/>Ключ подписи NEAR: новый ed25519 на каждый старт
  R->>D: getQuote(sha256(publicKey) ‖ sealKey)
  D-->>R: quote TDX с подписью Intel и event_log
  Note over R: поднимает GET /attestation и ждёт ключ
  O->>R: GET /attestation: publicKey, sealKey, quote, event_log, хэш политик
  Note over O: swarm.sh runner-key → verify.ts: quote подлинный (Intel), report_data = оба ключа,<br/>журнал сходится с RTMR3, compose-hash = app-compose.json
  O->>RA: AddKey: function-call на swarm, методы review, assign, finish, 5 NEAR на газ
  O->>K: set_config(seal_key = sealKey), если ключ новый
  loop каждые 15 с, пока ключа нет
    R->>RA: viewAccessKey(publicKey)
  end
  R->>K: view config: seal_key совпадает с моим?
  R-->>O: лог ready: sealKey, хэш политик
```

Без TEE (локально и в testnet) оба ключа выводятся из `DEV_KEY`, quote нет (`/attestation` отвечает `dev: true`),
команда `swarm.sh dev-key` добавляет ключ и записывает `seal_key`.

## 5. Регистрация агента и ревью

Когда: спонсор решил добавить агента. Ревью — на ближайшем круге раннера (до 30 с).

```mermaid
sequenceDiagram
  autonumber
  actor S as Спонсор
  participant CLI as swarm.sh agent у спонсора
  participant T as Токен USDC
  participant K as Контракт
  participant R as Раннер в TEE
  participant L as NEAR AI, модель протокола
  participant H as Хостинг библиотеки
  participant I as Intel PCCS
  opt перед тем как доверить манифест
    CLI->>R: GET /attestation
    R-->>CLI: publicKey, sealKey, quote, event_log
    CLI->>I: коллатерал для проверки подписи
    Note over CLI: swarm.sh verify-seal → verify.ts: quote подлинный, report_data = ключи,<br/>журнал сходится с RTMR3, compose-hash = наш, sealKey = seal_key контракта
  end
  opt большая база знаний
    S->>CLI: swarm.sh library notes.md
    Note over CLI: шифрует файл с associated data = аккаунт|library
    S->>H: выкладывает notes.md.sealed куда угодно
    Note over S: вписывает url и hash в манифест
  end
  S->>CLI: manifest.json, сумма, потолок за задачу
  CLI->>K: view config: seal_key
  Note over CLI: шифрует на машине спонсора: X25519 + HKDF + AES-GCM,<br/>аккаунт спонсора в associated data. Открытый текст не уходит
  CLI->>T: ft_transfer_call(swarm, amount, Register: manifest base64, max_cost)
  T->>K: ft_on_transfer(sponsor, amount, msg)
  Note over K: review_fee на баланс оператора, остаток на баланс спонсора.<br/>Хранит шифротекст и sha256, статус Pending, событие register
  K-->>T: 0: ничего не возвращать
  loop каждые 30 с
    R->>K: view agents(from, 100)
  end
  R->>K: view manifest(account): шифротекст
  Note over R: sha256 совпал с hash? Открывает с AAD = account.<br/>Проверяет схему, модель из списка, инструменты
  opt в манифесте есть library
    R->>H: GET url через SSRF-фильтр, до 10 MB
    H-->>R: шифротекст
    Note over R: sha256 совпал? открывает с AAD = account|library, режет на куски по 1500 символов
    R->>L: embeddings всех кусков (Qwen3-Embedding, в TEE)
    L-->>R: векторы: индекс в памяти раннера
  end
  R->>L: manifest.md и весь манифест как JSON-данные
  L-->>R: allow, reason (reason в лог не пишется)
  R->>K: review(account, hash, allow): Active или Suspended, событие review
```

Если манифест не открывается (чужой ключ, копия под другим аккаунтом, испорчен) или не проходит схему —
отказ без вызова модели. Если спонсор перерегистрировался во время ревью — `review` отклоняется как устаревший.

## 6. Задача: один раунд

Когда: заказчик нанял рой; раннер видит назначение на ближайшем круге (до 30 с).

```mermaid
sequenceDiagram
  autonumber
  actor C as Заказчик
  participant M as Agent Market
  participant R as Раннер в TEE
  participant K as Контракт
  participant L as NEAR AI
  participant W as Публичный веб
  C->>M: задача, оплата в эскроу, найм роя
  loop каждые 30 с
    R->>M: GET /v1/agents/me/assignments
  end
  M-->>R: assignment: id, status, startedAt, deliverableUrl и job: title, description
  R->>M: GET messages: сообщения заказчика
  R->>L: job.md и title, description = бриф и сообщения
  L-->>R: allow, reason
  alt задача не проходит
    R->>M: POST decline: rejected, причина. Заказчику полный возврат
  end
  Note over R: пул: Active, баланс не меньше max_cost, манифест открывается,<br/>потолок покрывает худший шаг, один агент на одинаковый манифест
  R->>L: route.md и task, agents: id и skills
  L-->>R: questions: id и вопрос, не больше SLOTS
  R->>M: POST start: теперь заказчик не может отменить бесплатно
  R->>K: assign(job, аккаунты): удержание max_cost у каждого, событие assign
  par каждый выбранный агент отдельно
    opt у агента есть библиотека
      R->>L: embedding вопроса
      L-->>R: вектор: 6 ближайших кусков, стоимость на счёт агента
    end
    R->>L: system = промпт, знания и найденные куски, user = задача и его вопрос
    L-->>R: шаг: текст или вызов fetch_url
    R->>W: GET https через SSRF-фильтр
    W-->>R: текст страницы
    R->>L: следующий шаг, пока не ответ, лимит шагов или потолок
    L-->>R: ответ агента и usage: токены, из них стоимость
  end
  R->>L: compose.md и task, previous, contributions: id, вопрос, ответ
  L-->>R: answer и scores: id, вклад 0–10, violation
  R->>K: finish(job, cost, weight, violation): стоимость оператору, остаток агентам, событие finish
  R->>M: POST submit: deliverableMarkdown
  M-->>C: ответ
```

Задача на цепочке называется `<assignment>#<round>`; здесь раунд 1.

## 7. Доработка и повтор после спора

Когда: заказчик нажал «Request changes» или арбитр велел переделать. Назначение снова `in_progress`.

```mermaid
sequenceDiagram
  autonumber
  actor C as Заказчик
  participant M as Agent Market
  participant R as Раннер в TEE
  participant L as NEAR AI
  participant K as Контракт
  C->>M: вернуть на доработку и замечание в переписке
  R->>M: GET assignments: in_progress, deliverableUrl уже есть
  R->>M: GET deliverable/versions: N версий, значит раунд N+1
  R->>M: GET messages: замечания заказчика
  Note over R: задача для агентов = бриф и все сообщения заказчика.<br/>Прошлый ответ агентам не показывается: в нём знания всех агентов
  R->>L: проверка задачи, маршрутизация, вклады: как в раунде 1
  R->>K: assign(новый job, раунд N+1)
  R->>M: GET deliverable/raw: прошлый ответ
  R->>L: compose.md и task, previous = прошлый ответ, contributions
  L-->>R: исправленный answer и scores
  R->>K: finish(job раунда N+1)
  R->>M: POST submit: новая версия
```

Выручка уйдёт тому раунду, который заказчик принял (последнему). Ранние раунды без выручки любой закроет после `pay_secs`.

## 8. Деньги: выручка и вывод

Когда: заказчик принял работу (или арбитр решил в пользу роя).

```mermaid
sequenceDiagram
  autonumber
  actor C as Заказчик
  participant M as Agent Market
  actor P as Оператор
  participant T as Токен USDC
  participant K as Контракт
  actor S as Спонсор
  participant L as NEAR AI
  C->>M: принять работу
  M->>P: эскроу на счёт владельца роя на рынке
  P->>P: вывести USDC с рынка на operator.ROOT, вручную в вебе рынка
  P->>K: view job(id + раунд 1..20): последний раунд, это делает swarm.sh revenue
  P->>T: ft_transfer_call(swarm, amount, Revenue: job)
  T->>K: ft_on_transfer
  Note over K: fee_bps на баланс владельца, остальное по весам на балансы спонсоров.<br/>Задача удаляется, событие revenue
  S->>K: withdraw(amount или всё)
  K->>T: ft_transfer(спонсор, amount)
  T-->>K: успех или отказ
  Note over K: on_withdraw: при отказе деньги возвращаются на баланс, событие withdraw
  P->>K: withdraw: возмещение инференса и review_fee
  P->>L: оплата счёта NEAR AI, вне цепочки
```

Почему выручку пересылают вручную: токен агента на Agent Market по их правилам не двигает деньги, а выплата приходит
на счёт владельца на рынке. Всё, что после этого, проверяемо на цепочке.

## 9. Сбои: кто замечает и что происходит

| Ситуация | Кто замечает | Что происходит | Деньги |
|---|---|---|---|
| Раннер упал после `assign`, до `finish` | раннер после рестарта: раунд открыт | `finish` с нулями, раунд запускается заново | удержания возвращаются целиком, инференс до сбоя оплачивает оператор |
| Раннер упал между `finish` и `submit` | раннер: раунд закрыт, а ответа нет | `decline failed` | заказчику полный возврат; раунд без выручки закроется по `pay_secs` |
| Agent Market не принял ответ | раннер | ответ ждёт в памяти, сдача повторяется каждый круг (она идемпотентна) | — |
| Сборка ответа не удалась | раннер | `finish` с нулями, `decline failed` | агенты ничего не платят: это наша ошибка |
| Подходящих агентов нет | модель маршрутизации | `decline`: заказчику полный возврат | никто ничего не платит |
| Нет агентов в статусе `Active` | раннер | `no_agents`, повтор каждый круг | — |
| Агент нарушил правила | модель сборки | вес 0, остаток удержания владельцу, агент `Suspended` | теряет до `max_cost` |
| Задача зависла: раннер мёртв больше `run_secs` | любой | `close`: удержания назад | никто не теряет |
| Вывод не дошёл (нет регистрации на токене) | контракт в `on_withdraw` | деньги возвращаются на баланс | ничего не теряется |
| `seal_key` в контракте не совпал с ключом раннера | раннер на старте | лог `seal_key_mismatch` | новые манифесты не откроются, пока владелец не исправит |
| Деньги в контракте разошлись с балансом токена | `swarm.sh status` | `pause`: раннер без ключей | работа стоит, деньги на месте |

## 10. Время

| Что | Значение | Где задаётся |
|---|---|---|
| Круг раннера: цены, ревью, ставки, назначения | 30 с | `POLL_MS` |
| Ожидание ключа раннера после старта в TEE | проверка каждые 15 с | код |
| Один вызов агента или модели протокола | до 120 с | `AGENT_TIMEOUT_MS` |
| Шагов у агента | до `maxSteps` (не больше 8) или до потолка | манифест |
| Незавершённую задачу можно закрыть | через 30 мин после `assign` | `run_secs` |
| Выручка ждётся | 14 дней после `finish` | `pay_secs` |
| Срок сдачи по назначению | SLA рынка | Agent Market, `slaDeadlineAt` |

## 11. Форматы

**Зашифрованный манифест** (`node/src/seal.ts`):
```
эфемерный X25519 публичный ключ (32) | nonce (12) | AES-256-GCM шифротекст | тег (16)
ключ = HKDF-SHA256(X25519(eph, seal_key), salt = eph_pub | seal_key, info = "swarm-for-hire manifest v1")
associated data = аккаунт спонсора
```

**Манифест в открытом виде** (видит только спонсор и раннер в TEE):
```json
{ "name": "...", "model": "z-ai/glm-5.3-flash", "skills": "что знает и умеет",
  "system": "промпт", "knowledge": "закрытые знания", "tools": ["fetch_url"], "maxSteps": 4,
  "library": { "url": "https://.../notes.md.sealed", "hash": "<sha256 зашифрованного файла>" } }
```
Библиотека шифруется так же, но с associated data `<аккаунт>|library`: манифест нельзя выдать за библиотеку и наоборот.

**Деньги на цепочке:**
```json
ft_transfer_call msg: {"Register":{"manifest":"<base64>","max_cost":"500000"}}
                      {"TopUp":{"agent":"<account>"}}
                      {"Revenue":{"job":"<assignment>#<round>"}}
review   {"agent":"...","hash":"<sha256 hex>","allow":true}
assign   {"job":"<assignment>#<round>","agents":["...","..."]}
finish   {"job":"...","outcomes":[{"cost":"2000","weight":6,"violation":false}]}
событие  EVENT_JSON:{"standard":"swarm","version":"1.0.0","event":"finish","data":{"job":"...","earned":true}}
```

**Модель протокола** (вход — JSON-данные в сообщении user, правила — в system):
```json
route   → {"task":"...","agents":[{"id":0,"skills":"..."}]}
        ← {"questions":[{"id":0,"question":"..."}]}
compose → {"task":"...","previous":"","contributions":[{"id":0,"question":"...","text":"..."}]}
        ← {"answer":"...","scores":[{"id":0,"score":6,"violation":false}]}
```

**Агент** (один вызов модели на шаг):
```
system: <промпт агента> + <knowledge>…</knowledge> + <library>6 ближайших кусков</library>
user:   # <заголовок задачи>\n\n<описание>\n\n## Customer messages ... \n\n# Your part\n\n<вопрос>
tools:  fetch_url(url: https)  — только если разрешён в манифесте
```

**Agent Market:**
```json
POST /v1/assignments/{id}/start
POST /v1/assignments/{id}/submit   {"deliverableMarkdown":"<answer>\n\n---\nComposed by Swarm-for-Hire from 2 agents, round 1."}
POST /v1/assignments/{id}/decline  {"reason":"rejected" | "failed","detail":"..."}
```

**Аттестация** (лог раннера на старте в TEE):
```json
{"event":"attest","publicKey":"ed25519:...","sealKey":"<hex 32 байта>","quote":"<hex>","event_log":"<json>","policies":"<sha256>"}
report_data (64 байта) = sha256(publicKey) | sealKey
```
