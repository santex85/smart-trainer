# Отчёт тестирования UI (6 марта 2026)

## Шаг 2: Флоу аутентификации (LoginScreen, RegisterScreen)

### Валидация — проверено

| Сценарий | Результат | Сообщение об ошибке |
|----------|-----------|----------------------|
| Пустой email + пароль | ✅ | «Введите email и пароль» |
| Невалидный email (badmail) | ✅ (RegisterScreen) | «Некорректный формат email» |
| Короткий пароль (123) | ✅ (RegisterScreen) | «Пароль не менее 6 символов» |
| Регистрация нового юзера | ✅ | Успешный вход на Home |

### UX

- **Состояние загрузки**: инпуты становятся `readonly`, кнопка показывает `ActivityIndicator` — понятно.
- **Блокировка интерфейса**: `editable={!loading}` и `disabled={loading}` — интерфейс не блокируется полностью.

### Найденные проблемы

1. **LoginScreen не валидирует формат email** — невалидный email уходит в API, пользователь получает «Invalid email or password» вместо «Некорректный формат email».
2. **Кнопки без `accessibilityRole="button"`** — TouchableOpacity рендерится как `div`, что ухудшает доступность и работу с автоматизацией.

---

## Шаг 3: IntervalsLinkScreen

### Верстка

- Инпуты Athlete ID и API Key: корректные размеры, читаемые placeholder.
- Контраст: светлый текст на тёмном фоне — ок.

### Фейковые данные

- Введены: `fake_athlete_123`, `fake_api_key_xyz`.
- **Результат**: бэкенд принимает любые данные без проверки Intervals.icu API. Показывается «Подключено» (Connected), хотя реальная синхронизация будет падать с ошибкой.

### Алерты

- При успешном сохранении: `Alert.alert(t("common.alerts.done"), t("intervals.linkSuccess"))`.
- При ошибке: `Alert.alert(t("common.error"), getErrorMessage(e, t))`.
- При фейковых данных: алерт не показывается, т.к. бэкенд не валидирует credentials при link.

### Найденные проблемы

1. **Нет валидации credentials при link** — пользователь видит «Подключено», но при синхронизации получает ошибку. Нужно либо проверять credentials при link, либо явно показывать, что проверка будет при следующей синхронизации.

---

## Шаг 4: Основная навигация

### Проверенные экраны

| Экран | Статус | Замечания |
|-------|--------|-----------|
| Dashboard (Главная) | ✅ | Сон, тренировки, Intervals.icu, FAB |
| Chat | ✅ | Переход по табу |
| Analytics | ✅ | Период, категории, «Спросить ИИ» |
| Profile | ✅ | Переход по табу |
| Intervals.icu | ✅ | Модалка открывается/закрывается |
| Photo (FAB) | ✅ | Кнопка доступна |

### Консоль браузера

- **useNativeDriver** — ожидаемое предупреждение на web (fallback на JS).
- **Slow network font** — медленная загрузка шрифта Ionicons.
- **Stale element reference** — от автоматизации, не от приложения.

---

## Сводка: баги и UX-проблемы

### 1. LoginScreen: нет валидации формата email

**Проблема**: Невалидный email (например, `badmail`) отправляется в API; ошибка «Invalid email or password» вместо «Некорректный формат email».

**Правка**: В `LoginScreen.tsx` добавить проверку формата email через `EMAIL_FORMAT_RE` перед вызовом API.

### 2. Доступность: кнопки без accessibilityRole

**Проблема**: TouchableOpacity в LoginScreen и RegisterScreen рендерится как `div`, что ухудшает доступность и работу с автоматизацией.

**Правка**: Добавить `accessibilityRole="button"` к TouchableOpacity.

### 3. Intervals.icu: «Подключено» без проверки credentials

**Проблема**: Бэкенд сохраняет credentials без проверки Intervals.icu API. Пользователь видит «Подключено», но синхронизация падает с ошибкой.

**Правка**: Либо проверять credentials при link (например, через `GET /athlete`), либо показывать предупреждение: «Проверка будет при первой синхронизации».

---

## Предлагаемые правки в коде

### Правка 1: LoginScreen — валидация email

```tsx
// LoginScreen.tsx
const EMAIL_FORMAT_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

const handleLogin = async () => {
  const e = email.trim().toLowerCase();
  if (!e || !password) {
    setError(t("auth.emailRequired"));
    return;
  }
  if (!EMAIL_FORMAT_RE.test(e)) {
    setError(t("auth.invalidEmailFormat"));
    return;
  }
  // ...
};
```

### Правка 2: LoginScreen и RegisterScreen — accessibilityRole

```tsx
// LoginScreen.tsx
<TouchableOpacity
  accessibilityRole="button"
  accessibilityLabel={t("auth.login")}
  style={[styles.buttonPrimary, ...]}
  onPress={handleLogin}
  disabled={loading}
>

// RegisterScreen.tsx
<TouchableOpacity
  accessibilityRole="button"
  accessibilityLabel={t("auth.registerCta")}
  style={[styles.buttonPrimary, ...]}
  onPress={handleRegister}
  disabled={loading}
>
```

### Правка 3: IntervalsLinkScreen — UX при link

Вариант A — проверка на бэкенде при link (если API Intervals.icu позволяет).

Вариант B — предупреждение в UI: после успешного link показывать «Подключено. Проверка будет при первой синхронизации».

---

## Верстка и доступность

- Контраст: светлый текст на тёмном фоне — ок.
- Glass-эффекты: `backdropFilter: blur(20px)` на web — корректно.
- Съехавших элементов и перекрывающихся текстов не обнаружено.
- Размеры элементов: достаточны для тапа на мобилке.

---

## Usability

- Состояние загрузки: понятно (ActivityIndicator, readonly).
- Потоки: логичные, пользователь не «застревает».
- Рекомендация: добавить `accessibilityRole` для кнопок, чтобы улучшить работу screen readers и автоматизации.
