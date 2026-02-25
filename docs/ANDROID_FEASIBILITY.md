# Анализ сложности разработки Android-приложения Smart Trainer

**Дата:** 25 февраля 2026  
**Проект:** Smart Trainer — AI-тренер (FastAPI + React Native/Expo + PostgreSQL)

---

## Резюме (TL;DR)

**Сложность: НИЗКАЯ.** Проект уже написан на Expo / React Native и _де-факто_ готов к сборке под Android. Фронтенд не содержит web-only зависимостей. Все экраны, навигация, хранилище и API-клиент используют кроссплатформенные абстракции React Native. Основная работа — конфигурация сборки, тестирование на устройствах и публикация в Google Play.

**Ориентировочная оценка:**

| Этап | Трудозатраты |
|------|-------------|
| Сборка и запуск на Android (dev) | 1–2 дня |
| Тестирование и исправление платформенных багов | 2–4 дня |
| Конфигурация production-сборки (подпись, иконки, splash) | 1 день |
| Публикация в Google Play | 1–2 дня |
| **Итого MVP** | **5–9 рабочих дней** |

---

## 1. Текущее состояние проекта

### 1.1 Стек фронтенда

| Компонент | Версия | Android-совместимость |
|-----------|--------|----------------------|
| Expo | ~52.0.0 | Полная |
| React Native | 0.76.3 | Полная |
| React Navigation (native-stack, bottom-tabs) | 7.x | Полная |
| AsyncStorage | ^1.23.1 | Полная |
| expo-camera | ~16.0.0 | Полная |
| expo-image-picker | ~16.0.0 | Полная |
| react-native-calendars | ^1.1314.0 | Полная |
| react-native-safe-area-context | 4.12.0 | Полная |
| react-native-screens | ~4.4.0 | Полная |

**Вывод:** Все зависимости — кроссплатформенные. Нет ни одной web-only библиотеки.

### 1.2 Конфигурация Android уже присутствует

В `app.json` уже задана секция `android`:

```json
{
  "android": {
    "adaptiveIcon": {
      "foregroundImage": "./assets/adaptive-icon.png",
      "backgroundColor": "#1a1a2e"
    },
    "package": "com.smarttrainer.app",
    "permissions": ["android.permission.CAMERA"]
  }
}
```

- Package name: `com.smarttrainer.app`
- Adaptive icon: настроен (файл `adaptive-icon.png` нужно проверить/создать)
- Разрешение камеры: запрошено

### 1.3 Экраны приложения (8 штук)

| Экран | Файл | Особенности |
|-------|------|-------------|
| Login | `LoginScreen.tsx` | Формы, клавиатура |
| Register | `RegisterScreen.tsx` | Формы, клавиатура |
| Dashboard | `DashboardScreen.tsx` | ScrollView, модальные окна, pull-to-refresh, FAB |
| Camera/Photo | `CameraScreen.tsx` | expo-camera, expo-image-picker, загрузка файлов |
| Chat | `ChatScreen.tsx` | FlatList, KeyboardAvoidingView, real-time сообщения |
| Athlete Profile | `AthleteProfileScreen.tsx` | Формы, аватар |
| Wellness | `WellnessScreen.tsx` | Calendar, формы, графики |
| Intervals Link | `IntervalsLinkScreen.tsx` | Формы, Linking API |

**Все экраны** используют только компоненты React Native (`View`, `Text`, `TouchableOpacity`, `TextInput`, `FlatList`, `ScrollView`, `Modal`, `Image`, `Alert`) — никаких web-specific API.

### 1.4 API-клиент

Файл `client.ts` уже содержит платформозависимую логику:

```typescript
function isWeb(): boolean {
  return Platform.OS === "web";
}

// На native: конвертация content:// и ph:// URI в Blob через XHR
function uriToBlobNative(uri: string): Promise<Blob> { ... }
```

Загрузка фото, отправка FormData, обработка `content://` URI — всё реализовано и работает на нативных платформах.

### 1.5 Хранение токенов

Используется `@react-native-async-storage/async-storage` — работает на Android из коробки (SharedPreferences под капотом).

---

## 2. Что потребуется для Android-сборки

### 2.1 Минимальные шаги (запуск на эмуляторе/устройстве)

1. **Установка зависимостей:** `cd frontend && npm install`
2. **Запуск:** `npx expo start --android` или `npx expo run:android`
3. **Настройка API URL:** переменная `EXPO_PUBLIC_API_URL` должна указывать на доступный бэкенд (не `localhost`, т.к. Android-эмулятор использует `10.0.2.2` для доступа к хосту, а реальное устройство — IP в локальной сети или публичный URL)

**Это буквально всё для dev-режима.** Expo делает остальное автоматически.

### 2.2 Потенциальные платформенные проблемы

| Проблема | Вероятность | Описание | Решение |
|----------|-------------|----------|---------|
| KeyboardAvoidingView | Средняя | `behavior="padding"` задан только для iOS. На Android может быть некорректное поведение клавиатуры в ChatScreen и LoginScreen | Добавить `behavior="height"` для Android или использовать `android:windowSoftInputMode` в AndroidManifest |
| FIT-файлы | Низкая | Загрузка FIT сейчас работает только на web (`Platform.OS !== "web"` → показывает алерт). На Android нужен file picker | Добавить `expo-document-picker` для выбора .fit файлов на устройстве |
| Camera permissions | Низкая | `expo-camera` и `expo-image-picker` запрашивают разрешения. На Android 13+ нужны новые разрешения для медиа | Проверить permissions на Android 13+ (READ_MEDIA_IMAGES) |
| URL API_BASE | Средняя | При пустом `EXPO_PUBLIC_API_URL` используется `""` (same origin) — работает на web, но не на Android | Нужен явный URL бэкенда для нативных сборок |
| Splash screen | Низкая | Ссылка на `splash.png` есть в app.json, но файл может отсутствовать в assets | Создать splash.png или убрать из конфигурации |
| adaptive-icon.png | Низкая | Файл упомянут в конфигурации, но не проверен | Создать файл 1024x1024 px |
| Шрифты / Эмодзи | Низкая | Используется эмодзи `📷` и `🖼️` в CameraScreen — могут отображаться по-разному на разных Android-устройствах | Заменить на иконки (например, `@expo/vector-icons`) |
| Debug-логирование | Нет | Fetch к `http://127.0.0.1:7473/ingest/...` в DashboardScreen и ChatScreen — отладочный код. На Android будет молча fail-ить (`.catch(() => {})`) | Удалить перед production-сборкой |

### 2.3 Что НЕ нужно менять

- **Навигация** — React Navigation 7 работает идентично на Android
- **AsyncStorage** — работает на Android
- **API-клиент** — уже поддерживает нативные платформы (конвертация URI, FormData)
- **Стили** — все через StyleSheet, никаких CSS-in-JS web-only
- **Локализация** — используется внутренняя система i18n через объект `ru`
- **Модальные окна** — используется React Native `Modal`, работает на Android
- **Pull-to-refresh** — `RefreshControl` работает на Android
- **Безопасная область** — `SafeAreaProvider` + `SafeAreaView` работают на Android

---

## 3. Production-сборка для Google Play

### 3.1 С EAS Build (рекомендуется)

Expo Application Services (EAS) позволяет собрать APK/AAB в облаке без локальной установки Android SDK:

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform android --profile production
```

Создаст файл `eas.json` и соберёт `.aab` для Google Play.

**Стоимость:** бесплатный тариф Expo — 30 сборок/месяц. Достаточно для MVP.

### 3.2 Локальная сборка

```bash
npx expo run:android --variant release
```

Требует:
- Android SDK (Android Studio)
- JDK 17+
- Настройка signing key (keystore)

### 3.3 Публикация в Google Play

| Шаг | Описание | Время |
|-----|----------|-------|
| 1. Google Play Developer Account | Регистрация ($25 единоразово) | 1 час |
| 2. App listing | Название, описание, скриншоты, иконка | 2–4 часа |
| 3. Privacy Policy | Обязательна (AI-обработка фото еды, данные здоровья) | 2–3 часа |
| 4. Content rating | Анкета IARC | 30 мин |
| 5. Upload AAB | Загрузка в консоль | 15 мин |
| 6. Review | Google review (обычно 1–7 дней для первого приложения) | 1–7 дней |

### 3.4 Специфические требования Google Play

- **Data Safety:** Приложение собирает: email, пароль, фото еды, данные сна/пульса/HRV/веса, тренировки, координаты (если Strava). Нужно заполнить Data Safety форму.
- **Health & Fitness:** Приложение связано с фитнесом и здоровьем. Google может потребовать дополнительную верификацию. Рекомендуется добавить дисклеймер «не является медицинским устройством».
- **Target API Level:** В 2026 Google Play требует targetSdkVersion 34+. Expo 52 по умолчанию использует актуальный target.

---

## 4. Дополнительные улучшения (не обязательные для MVP)

### 4.1 Push-уведомления

Оркестратор генерирует рекомендации Go/Modify/Skip по расписанию (7:00 и 16:00). На Android можно добавить push-уведомления через `expo-notifications` + Firebase Cloud Messaging (FCM):

| Компонент | Сложность |
|-----------|-----------|
| Настройка FCM в Firebase Console | 1–2 часа |
| Интеграция `expo-notifications` | 2–4 часа |
| Отправка push из backend (при генерации решения) | 2–4 часа |
| **Итого** | **1–2 дня** |

### 4.2 Offline-режим

Текущее приложение полностью зависит от сети. Для Android было бы полезно:
- Кэширование последних данных питания и wellness
- Очередь отправки при отсутствии сети

**Сложность:** 3–5 дней (SQLite или WatermelonDB для offline-first).

### 4.3 Виджеты на домашнем экране

Android позволяет создавать виджеты. Можно показывать:
- Текущий CTL/ATL/TSB
- Калории за день
- Решение AI-тренера

**Сложность:** 3–5 дней (кастомный нативный модуль или `react-native-android-widget`).

### 4.4 Загрузка FIT-файлов на Android

Текущая реализация позволяет загружать `.fit` файлы только на web. Для Android нужно:
- Добавить `expo-document-picker`
- Реализовать file picker UI
- Адаптировать `uploadFitWorkout` для `content://` URI

**Сложность:** 0.5–1 день.

---

## 5. Архитектурная карта для Android

```
┌──────────────────────────────────────────────────┐
│                 Android App (Expo)                │
│                                                    │
│  ┌──────────┐ ┌──────────┐ ┌───────────────────┐ │
│  │ Login    │ │ Register │ │     Dashboard     │ │
│  └──────────┘ └──────────┘ │  - Nutrition      │ │
│                             │  - Wellness       │ │
│  ┌──────────┐ ┌──────────┐ │  - Fitness        │ │
│  │ Camera   │ │   Chat   │ │  - Workouts       │ │
│  │ (Photo)  │ │ (AI)     │ │  - Orchestrator   │ │
│  └──────────┘ └──────────┘ └───────────────────┘ │
│                                                    │
│  ┌──────────┐ ┌──────────┐ ┌───────────────────┐ │
│  │ Profile  │ │Intervals │ │    Wellness       │ │
│  │ (Athlete)│ │ Link     │ │    (Calendar)     │ │
│  └──────────┘ └──────────┘ └───────────────────┘ │
│                                                    │
│  ┌────────────────────────────────────────────┐   │
│  │         API Client (client.ts)             │   │
│  │  - JWT auth (access + refresh tokens)      │   │
│  │  - FormData upload (native blob handling)  │   │
│  │  - Platform-aware URI conversion           │   │
│  └────────────────────────────────────────────┘   │
│                                                    │
│  ┌────────────────────────────────────────────┐   │
│  │       AsyncStorage (SharedPreferences)      │   │
│  └────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘
                        │
                   HTTPS / REST
                        │
┌──────────────────────────────────────────────────┐
│             Backend (FastAPI)                      │
│  /api/v1/auth/*       — JWT аутентификация        │
│  /api/v1/nutrition/*  — Gemini анализ фото еды    │
│  /api/v1/photo/*      — классификация фото        │
│  /api/v1/wellness     — сон, пульс, HRV           │
│  /api/v1/workouts/*   — тренировки + FIT          │
│  /api/v1/intervals/*  — Intervals.icu             │
│  /api/v1/chat/*       — AI чат + оркестратор      │
│  /api/v1/athlete-profile — профиль                │
└──────────────────────────────────────────────────┘
```

---

## 6. Риски

| Риск | Вероятность | Влияние | Митигация |
|------|-------------|---------|-----------|
| Expo SDK обновится и сломает зависимости | Низкая | Среднее | Зафиксировать версии, тестировать перед обновлением |
| Google Play отклонит из-за Health & Fitness | Средняя | Высокое | Добавить дисклеймер, Privacy Policy, Data Safety |
| Производительность на старых Android (< API 26) | Низкая | Низкое | Expo 52 поддерживает API 23+, но основная оптимизация для 26+ |
| Фрагментация Android устройств | Средняя | Среднее | Тестировать на 3–4 устройствах с разными размерами экрана |
| Бэкенд недоступен / медленный | Средняя | Высокое | Добавить таймауты, retry, offline-индикатор |

---

## 7. Заключение

Проект Smart Trainer **уже является Android-приложением** по своей архитектуре. Expo / React Native обеспечивает кроссплатформенность из коробки. Все экраны, API-клиент и хранилище данных используют кроссплатформенные абстракции.

Для получения рабочего APK/AAB нужно:
1. Запустить `npx expo start --android` для dev-тестирования
2. Исправить 3–4 мелких платформенных нюанса (KeyboardAvoidingView, FIT picker, API URL)
3. Подготовить ассеты (иконки, splash screen)
4. Собрать production-версию через EAS Build
5. Опубликовать в Google Play

**Общая трудоёмкость MVP: 5–9 рабочих дней** для одного разработчика, знакомого с React Native.

Если нужна только внутренняя (не Play Store) версия — достаточно **1–2 дней** для получения APK через `eas build --platform android --profile preview`.
