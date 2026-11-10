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

```bash
export NETWORK=testnet ROOT=alice.testnet TOKEN=usdc.alice.testnet
scripts/swarm.sh test-token           # свой USDC на testnet
scripts/swarm.sh deploy               # контракт + swarm/runner/operator.$ROOT
scripts/swarm.sh dev-key              # печатает DEV_KEY
cp .env.example .env                  # впишите DEV_KEY, CONTRACT, RUNNER_ACCOUNT, NEARAI_API_KEY, MARKET_TOKEN
npm start                             # раннер; в логе attest → ready
```

Раннер без TEE честно говорит об этом в `/attestation`, и `verify` его не пропустит. Спонсору на testnet
(или через страницу `http://127.0.0.1:8080`: зашифровать, зарегистрировать кошельком, загрузить):

```bash
scripts/swarm.sh fund bob.testnet 20
SPONSOR=bob.testnet RUNNER_URL=http://127.0.0.1:8080 TRUST_DEV_RUNNER=1 scripts/swarm.sh join agents/auditor 5
scripts/swarm.sh status bob.testnet   # через минуту-две: Active или Suspended
```

### Спонсору: отладка и кабинет

```bash
NEARAI_API_KEY=... node --experimental-strip-types scripts/try.ts agents/auditor "Is this vault safe? ..." --prompt
NEARAI_API_KEY=... node --experimental-strip-types scripts/try.ts agents/auditor --audit
```

Первая команда показывает найденные куски знаний, весь запрос, ответ, вердикт оценщика и худший расход против потолка.
Вторая — пройдёт ли аудит и что в материалах заметил скан. Как агент работает в рое, видно в кабинете
`<раннер>/cabinet.html`: вход кошельком, там же пополнение и вывод.

## 3. Агент роя на Agent Market

Agent Market работает в mainnet. Создайте агента роя и выставьте его:

```bash
node --experimental-strip-types scripts/market.ts register swarm-for-hire   # печатает MARKET_TOKEN один раз
MARKET_TOKEN=aat_... node --experimental-strip-types scripts/market.ts list <agent id> 10.00
```

Если рынок не даёт сделать шаг токеном агента, сделайте его в кабинете market.near.ai. В описании должно быть
сказано, сколько доработок входит в цену (`MAX_REWORKS`, по умолчанию 2).

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

## 5. Mainnet

То же, что на testnet, но `NETWORK=mainnet`, `ROOT=<ваш>.near`,
`TOKEN=17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1` (USDC в NEAR), без `test-token` и `dev-key`.
Раннер — только в TEE (шаг 4). Спонсоры вступают через страницу раннера или
`SPONSOR=bob.near RUNNER_URL=https://... COMPOSE=app-compose.json scripts/swarm.sh join agents/auditor 5`:
`join` проверяет quote, compose и ключ раннера и только потом шифрует.

## 6. Каждый день

| Что | Кто | Команда |
|---|---|---|
| переслать выплату за принятую работу | оператор | `scripts/swarm.sh revenue <assignment id> <usdc>` |
| проверить счета | любой | `scripts/swarm.sh status [аккаунт]` — `books OK` |
| вывести деньги | любой | `scripts/swarm.sh withdraw <аккаунт> [usdc]` |
| закрыть зависшую задачу | любой | `scripts/swarm.sh close '<assignment>#<раунд>'` |
| пополнить агента | спонсор | `SPONSOR=bob.near scripts/swarm.sh top-up bob.near 10` |
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
| `submitted`, `declined` | раунд закрыт; рядом расходы и выплаты | — |
| `load_failed`, `upload_missing` | не открылись материалы активного агента | проверить том `/data` |
| `error`, `http_error` | сбой внешнего сервиса; раунд повторится через 1, 2, 4, 8 минут, после пятого сбоя — отказ | если повторяется — смотреть NEAR AI / RPC / рынок |

## Проверка перед живым запуском

- [ ] `scripts/local.sh` зелёный.
- [ ] Контракт развёрнут, `status` показывает `books OK` и нужные настройки.
- [ ] В `docker-compose.yml` образ по дайджесту и правильные `CONTRACT`, `RUNNER_ACCOUNT`, `NEAR_RPC`.
- [ ] `verify` с `app-compose.json` — всё ✓; ключ выдан; в логе `ready`.
- [ ] На счёте NEAR AI есть кредиты; у `runner.$ROOT` есть NEAR на газ.
- [ ] Хотя бы два спонсора `Active` с балансом не меньше потолка.
- [ ] Агент роя на Agent Market `live`, в описании сказано про доработки.
- [ ] Пробная задача самому себе: ответ пришёл, `revenue` переслана, `status` — `books OK`.
