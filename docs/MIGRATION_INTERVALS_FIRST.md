# Миграция: Intervals-first без Strava

С версии, следующей за этим изменением, приложение больше не использует Strava для данных о тренировках и профиле. Состояние спортсмена и нагрузка считаются по данным Intervals.icu (wellness) и по локальным тренировкам (ручной ввод и загрузка FIT).

## Что изменилось

1. **Strava отключена**
   - Удалены роуты и экраны: подключение Strava, синхронизация, список активностей из Strava.
   - Эндпоинты `/api/v1/strava/*` удалены. Эндпоинт `POST /api/v1/athlete-profile/refresh-strava` удалён.
   - Данные в таблицах `strava_credentials`, `strava_activities`, `strava_sync_queue` и поля `strava_*` в `athlete_profile` больше не обновляются. Существующие строки остаются в БД (при необходимости их можно очистить отдельной миграцией).

2. **Источники данных**
   - **Состояние (readiness):** wellness из Intervals.icu и/или ручной ввод (сон, RHR, HRV). Поля CTL/ATL/TSB в wellness по-прежнему поддерживаются.
   - **Нагрузка (CTL/ATL/TSB):** считаются по таблице `workouts` (ручной ввод + импорт FIT). Если в wellness заполнены ctl/atl/tsb, оркестратор может использовать их; иначе используется расчёт по тренировкам.
   - **Тренировки:** только ручной ввод (CRUD `/api/v1/workouts`) и загрузка FIT (`POST /api/v1/workouts/upload-fit`).

3. **Новые сущности и API**
   - Таблица `workouts`: ручные и FIT-тренировки (дата, тип, длительность, дистанция, TSS, источник `manual`/`fit`).
   - `GET/POST/PATCH/DELETE /api/v1/workouts`, `GET /api/v1/workouts/fitness` (CTL/ATL/TSB по тренировкам).
   - Импорт FIT: дедупликация по SHA-256 файла; TSS по мощности+FTP или по длительности/типу.

## Действия после обновления

1. Выполнить миграции: `alembic upgrade head` (добавится таблица `workouts`).
2. Убедиться, что в `.env` не требуются переменные Strava для работы приложения (опционально можно удалить `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REDIRECT_URI`).
3. Пользователям: подключать Intervals.icu (Settings → API) и вводить wellness; добавлять тренировки вручную или загружать FIT на дашборде.

## Очистка старых данных Strava (опционально)

Если нужно удалить данные Strava из БД:

```sql
-- Только после резервного копирования
DELETE FROM strava_sync_queue;
DELETE FROM strava_activities;
DELETE FROM strava_credentials;
-- Обнулить strava_* в athlete_profile при необходимости
UPDATE athlete_profile SET
  strava_weight_kg = NULL, strava_ftp = NULL,
  strava_firstname = NULL, strava_lastname = NULL,
  strava_profile_url = NULL, strava_sex = NULL, strava_updated_at = NULL;
```

Отдельная миграция для DROP таблиц Strava не включена, чтобы не ломать существующие инсталляции без явного решения администратора.
