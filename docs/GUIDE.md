# Как с этим работать

Все команды из корня репозитория. `scripts/swarm.sh` без аргументов печатает список команд.

## Что нужно

| Инструмент | Для чего |
|---|---|
| Node 22, `npm ci` | раннер, скрипты, тесты |
| rustup, `wasm32-unknown-unknown`, `cargo-near` | сборка контракта |
| [near-cli-rs](https://github.com/near/near-cli-rs), `jq`, `curl` | команды в сети |
| Docker, [phala](https://docs.phala.com/phala-cloud/references/phala-cloud-cli/phala/overview) CLI | раннер в TEE |
| ключ NEAR AI Cloud (`NEARAI_API_KEY`) | модели |

## 1. Локально: всё проверить

```bash
scripts/local.sh        # тесты контракта, wasm, типы, юнит-тесты, e2e на локальной цепочке
npm run playground      # локальный рой: страница спонсора на http://127.0.0.1:18080, задачи вводятся в терминал
```

`local.sh` не нужны ни ключи, ни деньги: NEAR AI и Agent Market заменены заглушками ([e2e/mocks.ts](../e2e/mocks.ts)).

## 2. Testnet без TEE

Ключи храним файлами в `~/.near-credentials` (`KEYCHAIN=legacy-keychain`), NEAR берём с фасета, USDC — свой тестовый.

```bash
export NETWORK=testnet ROOT=myswarm.testnet TOKEN=usdc.myswarm.testnet KEYCHAIN=legacy-keychain
scripts/swarm.sh faucet $ROOT             # 10 NEAR с фасета
scripts/swarm.sh test-token               # тестовый USDC, 1 000 000 у владельца
SWARM_NEAR=3 scripts/swarm.sh deploy      # контракт + swarm/runner/operator.$ROOT
scripts/swarm.sh dev-key                  # печатает DEV_KEY: в .env.testnet (по образцу .env.example)
npm run stand-ins                         # пока нет ключей NEAR AI и Agent Market: заглушки на 18091/18092
npm run start:testnet                     # раннер; в логе attest → ready; страницы на http://127.0.0.1:8080
```

С настоящими ключами в `.env.testnet` впишите `NEARAI_URL=https://cloud-api.near.ai/v1`, `NEARAI_API_KEY`,
`MARKET_URL=https://market.near.ai`, `MARKET_TOKEN` и не запускайте заглушки. С заглушками нанять рой можно так:
`curl -X POST 127.0.0.1:18093/hire -d '{"description":"Project Alpha: when does it launch?"}'`, ответ — `GET 127.0.0.1:18093/tasks`
(правила заглушек: [e2e/mocks.ts](../e2e/mocks.ts)).

Раннер без TEE честно говорит об этом в `/attestation`, и `verify` его не пропустит. Спонсору на testnet:

```bash
scripts/swarm.sh faucet bob.testnet && scripts/swarm.sh fund bob.testnet 20    # NEAR с фасета, 20 тестовых USDC
SPONSOR=bob.testnet RUNNER_URL=http://127.0.0.1:8080 TRUST_DEV_RUNNER=1 scripts/swarm.sh join agents/auditor 5
scripts/swarm.sh status bob.testnet       # через минуту: Active или Suspended
node --experimental-strip-types scripts/cabinet.ts bob.testnet http://127.0.0.1:8080   # кабинет подписью ключа из ~/.near-credentials
```

Через браузер: `http://127.0.0.1:8080/app` — подключить кошелёк (в режиме testnet), «New expert», одно подтверждение;
там же дашборд и страницы экспертов. Аккаунту кошелька нужны тестовые USDC: `scripts/swarm.sh fund <аккаунт> 20`.

### Заказчику: заказ через контракт

```bash
scripts/swarm.sh faucet carol.testnet && scripts/swarm.sh fund carol.testnet 20   # NEAR с фасета, 20 тестовых USDC
export CUSTOMER=carol.testnet RUNNER_URL=http://127.0.0.1:8080
scripts/swarm.sh order "Is this staking contract safe to deploy on NEAR? https://github.com/you/project" 5
scripts/swarm.sh answers                  # через минуту-две: ответ, кому сколько заплачено, сколько вернулось
scripts/swarm.sh refund order-1           # если рой молчит дольше run_secs: вернуть весь бюджет
```

Текст задачи уходит раннеру, в контракте лежат бюджет и хеш текста (`PUBLISH=1` кладёт в транзакцию и сам текст). Расчёт делает контракт: ставки справившимся, накладные, 5% владельцу,
остаток сразу на кошелёк заказчика. Через браузер то же самое на `http://127.0.0.1:8080/order`; бриф с выбором
экспертов удобнее собрать на `/experts` и нажать «Or order on chain». Agent Market для этого пути не нужен:
без `MARKET_TOKEN` раннер обслуживает только заказы из контракта.

### Спонсору: отладка и кабинет

```bash
NEARAI_API_KEY=... node --experimental-strip-types scripts/try.ts agents/auditor "Is this vault safe? ..." --prompt
NEARAI_API_KEY=... node --experimental-strip-types scripts/try.ts agents/auditor --audit
```

Первая команда показывает найденные куски знаний, весь запрос, ответ, вердикт оценщика и худший расход против потолка.
Вторая — пройдёт ли аудит и что в материалах заметил скан.

Эксперт с чек-листами объявляет в `agent.json` `"work": "review"` (в приложении — поле «How it works»): тогда файлы
заказчика он читает всеми своими знаниями, часть за частью, а каждую находку проверяет отдельно
([как это устроено](PROTOCOL.md#раунд-задачи)). Проверка — десятки вызовов, поэтому потолок (`max_cost`) нужен
больше: форма ставит тот, что покрывает худший случай. Пробный запуск на своём файле:

```bash
NEARAI_API_KEY=... node --experimental-strip-types scripts/try.ts eval/agents/solidity-attack-paths "Audit this contract ..." --material Vault.sol --code
```

Он печатает, сколько частей прочитано, сколько находок поднято, сколько подтверждено и не подтверждено, и расход.
Один файл в `knowledge/` — один проход: кладите в файл то, что проверяется вместе. `--code` значит
«задача просит код»: тяжёлые находки получают доказательства. Как эксперт работает в рое, видно в приложении
`<раннер>/app`: вход кошельком, там же пополнение и вывод. По каждой задаче там итог с подсказкой, что менять
(например, `cut off`: ответ упёрся в лимит длины), а у принятой части ещё два сигнала: какая доля итогового
ответа пришла от эксперта и вернул ли заказчик этот ответ на доработку. Саму задачу владелец не видит никогда:
чинят эксперта по этим сигналам и на своих вопросах, потом регистрируют заново.

## 3. Агент роя на Agent Market

Agent Market работает в mainnet. Создайте агента роя и выставьте его:

```bash
node --experimental-strip-types scripts/market.ts register swarm-for-hire   # печатает MARKET_TOKEN один раз
MARKET_TOKEN=aat_... node --experimental-strip-types scripts/market.ts list <agent id>   # три плана: Quick 3, Standard 10, Deep 30
```

Если рынок не даёт сделать шаг токеном агента, сделайте его в кабинете market.near.ai. В описании должно быть
сказано, сколько доработок входит в цену (`MAX_REWORKS`, по умолчанию 2). Адрес страницы роя на рынке впишите
в `MARKET_LISTING_URL`: на него ведут кнопки «Hire» на сайте.

Выплаты Agent Market приходят на аккаунт роя. Оператор пересылает каждую в контракт (см. шаг 6).
Для пробы с контрактом на testnet оператор пересылает тестовые USDC на ту же сумму.

## 4. Раннер в TEE (Phala Cloud)

```bash
scripts/swarm.sh image ghcr.io/<you>/swarm-runner   # собрать, запушить, вписать дайджест в docker-compose.yml
# docker-compose.yml: впишите NEAR_RPC, CONTRACT, RUNNER_ACCOUNT, модели. Всё, что там, попадает в аттестацию.
cat > .env.tee <<'EOF'
NEARAI_API_KEY=...
MARKET_TOKEN=aat_...
BRAVE_API_KEY=
EOF
scripts/swarm.sh tee-deploy                         # phala deploy; секреты шифруются для TEE
```

В кабинете Phala найдите адрес порта 8080 (вида `https://<app-id>-8080.<шлюз>`) и сохраните `app-compose.json`
приложения в корень репозитория и опубликуйте: без него спонсоры не смогут проверить раннер (`join` его требует). Затем:

```bash
scripts/swarm.sh verify https://<app-id>-8080.<шлюз> app-compose.json      # всё ✓
scripts/swarm.sh runner-key https://<app-id>-8080.<шлюз> app-compose.json  # проверка + ключ раннеру
phala logs                                                                  # waiting_for_key → ready
```

После каждого перезапуска CVM ключ подписи новый: повторите `runner-key`, старый ключ удалите
(`near account delete-keys runner.$ROOT ...`). Ключ шифрования прежний: загруженные материалы открываются.

**Сколько стоит машина.** Phala берёт плату за каждый час, пока машина работает, и от числа задач счёт не зависит.
`tee-deploy` сам называет наименьший размер, `tdx.small` (1 vCPU, 2 ГБ; раннер занимает около 120 МБ): $0.058 в час
плюс диск 40 ГБ, вместе около $1.5 в сутки ([цены на 2026-11-12](https://cloud.phala.com/about/instance-types)).
Другой размер: `TEE_SIZE=tdx.medium`.

```bash
phala apps                    # что развёрнуто: машина должна быть одна
scripts/swarm.sh tee-stop     # остановить: платится только диск, около $0.13 в сутки
scripts/swarm.sh tee-delete   # удалить: не платится ничего; загруженные материалы пропадают
```

Повторный `tee-deploy` может создать вторую машину: после него проверьте `phala apps`. Работающую машину обновляет
та же команда `phala deploy` из [scripts/swarm.sh](../scripts/swarm.sh) с `--cvm-id swarm-runner`. Ключ Phala лежит в
`~/.phala-cloud/credentials.json`: с ним можно завести машину любого размера за ваш счёт, поэтому раннеру его не
дают и в `.env.tee` не пишут.

## 5. Mainnet

То же, что на testnet, но `NETWORK=mainnet`, `ROOT=<ваш>.near`,
`TOKEN=17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1` (USDC в NEAR), без `test-token` и `dev-key`.
Раннер — только в TEE (шаг 4). Спонсоры вступают через страницу раннера или
`SPONSOR=bob.near RUNNER_URL=https://... COMPOSE=app-compose.json scripts/swarm.sh join agents/auditor 5`:
`join` проверяет quote, compose и ключ раннера и только потом шифрует.

## 6. Каждый день

| Что | Кто | Команда |
|---|---|---|
| переслать выплаты за все принятые работы (всем справившимся экспертам всех раундов) | оператор | `scripts/swarm.sh payouts` (можно в cron; `--dry` — только показать) |
| спор решён разделом оплаты | оператор | `scripts/swarm.sh payouts --received <assignment>=<сколько пришло, USDC>` |
| проверить счета | любой | `scripts/swarm.sh status [аккаунт]` — `books OK` |
| вывести деньги | любой | `scripts/swarm.sh withdraw <аккаунт> [usdc]` |
| закрыть зависшую задачу | любой | `scripts/swarm.sh close '<assignment>#<раунд>'` |
| пополнить баланс эксперта | спонсор | приложение `/app` или `SPONSOR=bob.near scripts/swarm.sh top-up bob.near/auditor 10` |
| остановить раннер | владелец | `scripts/swarm.sh pause`, потом `resume` |
| изменить настройку | владелец | `scripts/swarm.sh set fee_bps 300` |

## Что значит лог раннера

| Событие | Значит | Что делать |
|---|---|---|
| `attest` | раннер поднялся, вот его ключи | проверить и дать ключ (`runner-key`) |
| `waiting_for_key` | ключ ещё не выдан | `runner-key` или `dev-key` |
| `ready` | работает | — |
| `paused`, `resumed` | владелец остановил раннер или вернул | — |
| `uploaded` | спонсор загрузил материалы | аудит в следующем цикле |
| `reviewed` | решение по агенту: `allow` и правило (`category`); причина и выдержки — только в кабинете спонсора | — |
| `no_agents` | для задачи пока нет готовых агентов | после перезапуска подождать индексации; иначе нужны спонсоры |
| `brief` | раннер принял текст будущего заказа под его хешем | — |
| `task`, `screened`, `team`, `materials` | шаги одной задачи: размер, тема, кого рассматривали и кого взяли (`replaced`: кого на кого раннер заменил по показателю использования), сколько материалов прочитано | — |
| `llm` | один вызов NEAR AI: шаг (`step`; у эксперта это `lookup`, справка по материалам, и `agent`, ответ; у проверки — `read` (своё чтение), `pass`, `check`, `combine` (что находки дают вместе), `same` (какие находки об одном и том же), `proof` и `findings`, эмбеддинги находок; `summary` — абзац перед находками, `control` — контролёр, если он задан), модель, токены (`in`, `out`, из них `reasoning`), цена в `micro_usd`, время; `error`, если вызов не удался | дорого или медленно — сменить модель |
| `tx` | транзакция раннера: метод, аргументы, хеш и события контракта | `error` — смотреть RPC и ключ раннера |
| `contribution` | часть одного эксперта: расход, зачтена ли и по какому правилу; `work` — `answer` или `review`, у проверки ещё счёт: частей прочитано (`passes`), находок поднято (`raised`), групп (`groups`), проверено (`checked`), подтверждено (`held`), не подтверждено, но показано (`leads`), доказательств (`proofs`), ответов, обрезанных по лимиту (`cut`) | `raised` много, `held` ноль — чек-лист не про эти файлы или модель слаба для проверки; `cut` больше одного-двух — лимит ответа мал для этой модели (`PASS_OUT`, `CHECK_OUT` в `rules.ts`) |
| `degraded` | сервис эмбеддингов не ответил: находки сгруппированы по словам, проверок будет больше | если повторяется — смотреть NEAR AI |
| `composed` | ответ собран из стольких-то частей; `findings` и `leads` — сколько подтверждённых находок и неподтверждённых пунктов в списке после сложения, `second` — у скольких находок есть слово контролёра | — |
| `submitted`, `declined` | раунд закрыт; рядом расходы и выплаты | — |
| `load_failed`, `upload_missing` | не открылись материалы активного агента | проверить том `/data` |
| `error`, `http_error` | сбой внешнего сервиса; раунд повторится через 1, 2, 4, 8 минут, после пятого сбоя — отказ | если повторяется — смотреть NEAR AI / RPC / рынок |

Каждая строка задачи несёт её id в поле `job`. В логе нет текста: ни задач, ни вопросов, ни ответов.

### Трассировка для тестов

С `TRACE_DIR=./trace` раннер пишет те же строки в `trace/<день UTC>.jsonl`, но уже с текстом: задача, вопросы
экспертам, что ушло в модель (`sent`) и что пришло (`got`), ответ до и после фильтра. Это ровно то, что TEE
скрывает, поэтому раннер принимает `TRACE_DIR` только вместе с `DEV_KEY`, а раннер на `DEV_KEY` не проходит `verify`.

```bash
jq -c 'select(.job == "order-3") | {t, event, step, model, ms, micro_usd}' trace/2026-11-12.jsonl   # одна задача по шагам
jq -s 'map(select(.event == "llm") | .micro_usd) | add / 1e6' trace/2026-11-12.jsonl                # потрачено за день, USD
jq 'select(.job == "order-3" and .step == "compose") | .sent.prompt | fromjson' trace/2026-11-12.jsonl # что видел сборщик
```

## Проверка перед живым запуском

- [ ] `scripts/local.sh` зелёный.
- [ ] Контракт развёрнут, `status` показывает `books OK` и нужные настройки.
- [ ] В `docker-compose.yml` образ по дайджесту и правильные `CONTRACT`, `RUNNER_ACCOUNT`, `NEAR_RPC`.
- [ ] `verify` с `app-compose.json` — всё ✓; ключ выдан; в логе `ready`.
- [ ] На счёте NEAR AI есть кредиты; у `runner.$ROOT` есть NEAR на газ.
- [ ] Хотя бы два спонсора `Active` с балансом не меньше потолка.
- [ ] Агент роя на Agent Market `live`, в описании сказано про доработки.
- [ ] Пробная задача самому себе: ответ пришёл, `revenue` переслана, `status` — `books OK`.
