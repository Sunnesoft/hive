# Как с этим работать

## Роли

| Роль | Аккаунт | Что делает |
|---|---|---|
| Владелец | `ROOT` (на хакатоне он же оператор) | деплой, ключ раннера, пауза, получает комиссию |
| Оператор | `operator.ROOT` | платит NEAR AI, получает выплаты Agent Market и пересылает их в контракт |
| Спонсор | любой аккаунт | регистрирует агента, пополняет, выводит |
| Раннер | `runner.ROOT`, ключ живёт в TEE | всё остальное делает сам: ревью, задачи, доработки, расчёт |
| Любой | — | `close` зависшей задачи, `status` |

Все команды сети: `scripts/swarm.sh` (запуск без аргументов печатает список).

## 1. Локально: без ключей и денег

```bash
rustup target add wasm32-unknown-unknown && cargo install cargo-near --locked   # один раз
scripts/local.sh
```

Что проверяется: тесты контракта, типы и тесты раннера, затем весь путь на локальной цепочке
(near-sandbox на nearcore 2.14.0, как в mainnet). Контракт и токен настоящие (wasm), раннер настоящий
(отдельный процесс). Заглушки только у внешних сервисов: NEAR AI и Agent Market.
Лог раннера: `VERBOSE=1 npm run e2e`.

## 2. Testnet

```bash
export NETWORK=testnet ROOT=sunnesoft.testnet TOKEN=usdc.sunnesoft.testnet
scripts/swarm.sh test-token                     # свой USDC, 1 000 000 у ROOT
scripts/swarm.sh deploy                         # swarm/runner/operator + контракт
scripts/swarm.sh fund operator.$ROOT 50         # оператору на тест выручки
scripts/swarm.sh dev-key                        # ключи раннера без TEE: печатает DEV_KEY, публикует seal_key

# спонсор и агент
near account create-account fund-myself researcher.$ROOT '1 NEAR' autogenerate-new-keypair \
  save-to-keychain sign-as $ROOT network-config testnet sign-with-keychain send
scripts/swarm.sh fund researcher.$ROOT 10
SPONSOR=researcher.$ROOT scripts/swarm.sh agent agents/researcher.json 5 0.5   # шифрует, 5 USDC, потолок 0.5 за задачу

# большая база знаний (необязательно): зашифровать, выложить куда угодно, вписать в манифест, затем agent
SPONSOR=researcher.$ROOT scripts/swarm.sh library notes.md   # создаёт notes.md.sealed и печатает {"library": {url, hash}}

# раннер без TEE
cp .env.example .env                            # вписать DEV_KEY, NEARAI_API_KEY, MARKET_TOKEN
npm start
```

В логе раннера появится `reviewed` для каждого агента. Затем Agent Market:

1. На market.near.ai создайте агента роя, пройдите верификацию билдера, выпустите токен `aat_…` в `MARKET_TOKEN`.
2. С другого аккаунта разместите задачу и наймите рой.
3. В логе: `finished` → `submitted`. Если заказчик попросит доработку, через круг будет новый раунд.
4. Заказчик принял работу, выплата пришла владельцу на Agent Market. Выведите её в USDC на `operator.ROOT` и перешлите:
   `scripts/swarm.sh revenue <assignment-id> <usdc>`. Скрипт сам находит принятый раунд.
5. Проверка: `scripts/swarm.sh status researcher.$ROOT`.

Модели и NEAR AI: ключ берётся на nearbuilders.org/join. Проверка ключа и модели протокола:
`curl -s https://cloud-api.near.ai/v1/chat/completions -H "Authorization: Bearer $NEARAI_API_KEY" -H 'content-type: application/json' -d '{"model":"z-ai/glm-5.3","messages":[{"role":"user","content":"ping"}]}' | jq .usage`

## 3. TEE (Phala Cloud)

1. `docker build -t ghcr.io/<you>/swarm-runner:v1 . && docker push ghcr.io/<you>/swarm-runner:v1`
2. Дайджест образа (`docker inspect --format '{{index .RepoDigests 0}}' …`) впишите в `docker-compose.yml` вместо тега.
3. Разверните CVM с этим compose. Секретов ровно два: `NEARAI_API_KEY`, `MARKET_TOKEN`. Остальное в compose и под аттестацией.
   Сохраните `app-compose.json` из панели Phala в репозиторий: по нему все проверяют, какой код запущен.
4. Раннер сразу отдаёт аттестацию по `https://<app-id>-8080.<шлюз Phala>/attestation` (и пишет её в лог `attest`) и ждёт ключ.
5. `scripts/swarm.sh runner-key <url> app-compose.json`. Скрипт (`scripts/verify.ts`) проверяет: quote подлинный
   (подпись Intel, статус TCB), `report_data` = оба ключа, журнал событий сходится с RTMR3, `compose-hash` = ваш compose.
   Затем спрашивает подтверждение, добавляет ключ подписи на три метода и записывает `seal_key` в конфиг, если он новый.
6. В логе `ready`. После каждого перезапуска CVM ключ подписи новый: повторите 4–5, старый удалите
   (`near account delete-keys runner.$ROOT …`). Ключ шифрования (`seal_key`) dstack выводит из идентичности приложения,
   он переживает перезапуски. Если он всё же сменится, старые манифесты не откроются, и спонсорам придётся зарегистрироваться заново.

**Спонсор проверяет раннер сам**, прежде чем доверить ему манифест:
`scripts/swarm.sh verify-seal https://<app-id>-8080.<шлюз Phala>/attestation app-compose.json`.
Те же проверки плюс одна: ключ из quote совпадает с `seal_key` в контракте. Если хоть одна строка с ✗ — не регистрироваться.
После каждого обновления раннера (новый compose) проверку стоит повторить.

## 4. Mainnet

```bash
export NETWORK=mainnet ROOT=sunnesoft.near TOKEN=17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1
```

`TOKEN` — нативный USDC на NEAR (проверено: `USDC`, 6 знаков). Шаги как в разделе 2, только без `test-token`,
плюс раздел 3. USDC, пришедший с Ethereum через Intents, сначала обменяйте в Intents на нативный:
`eth-0xa0b8…omft.near` — другой токен.

## 5. Каждый день

| Что | Команда |
|---|---|
| Сверка денег (раз в час) | `scripts/swarm.sh status`. При `BOOKS MISMATCH` сразу `scripts/swarm.sh pause` |
| Оператор забирает возмещение инференса и платит NEAR AI | `scripts/swarm.sh withdraw operator.$ROOT` |
| Выплата Agent Market пришла | `scripts/swarm.sh revenue <assignment> <usdc>` |
| Зависшая задача (раннер упал, прошло 30 мин) | `scripts/swarm.sh close '<assignment>#<round>'` (любой) |
| Спонсор выводит деньги | `scripts/swarm.sh withdraw <account> [usdc]` |
| Остановить и запустить раннер | `scripts/swarm.sh pause` / `resume` |
