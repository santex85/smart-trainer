# tssproAI — Отчёт по тестированию интерфейса и рекомендации по улучшениям

**Дата:** 2026-02-24  
**Версия проекта:** 0.1.0 (MVP)  
**Методология:** Статический анализ кода, анализ компонентов, оценка UX паттернов  
**Платформа:** Expo React Native (iOS, Android, Web)

---

## Сводка оценки интерфейса

| Экран | UX/UI Оценка | Accessibility | Ключевые проблемы |
|-------|--------------|---------------|-------------------|
| LoginScreen | 7/10 | 5/10 | Нет валидации email в реальном времени |
| RegisterScreen | 7/10 | 5/10 | Нет индикатора силы пароля |
| DashboardScreen | 6/10 | 4/10 | Перегруженность, отсутствие визуальной иерархии |
| CameraScreen | 7/10 | 6/10 | Хороший flow, но UX preview/save можно улучшить |
| ChatScreen | 6/10 | 5/10 | Нет timestamps, ограниченная интерактивность |
| StravaLinkScreen | 7/10 | 6/10 | Чёткий flow подключения |
| StravaActivityScreen | 7/10 | 5/10 | Хороший календарь, но мало деталей активности |
| AthleteProfileScreen | 8/10 | 6/10 | Хорошая структура, аватар из Strava |
| WellnessScreen | 7/10 | 5/10 | Простая форма, но нет визуализации трендов |
| IntervalsLinkScreen | 6/10 | 5/10 | Требует понимания API, нет автоопределения |

**Общая оценка интерфейса: 6.8/10**

---

## 1. Экран входа (LoginScreen)

### Текущее состояние
- Минималистичный дизайн с тёмной темой
- Правильная обработка клавиатуры (KeyboardAvoidingView)
- Загрузка состояния с индикатором

### Выявленные проблемы

#### 1.1 Нет валидации email в реальном времени (MEDIUM)
```typescript
// Сейчас: валидация только при нажатии кнопки
const handleLogin = async () => {
  const e = email.trim().toLowerCase();
  if (!e || !password) {
    setError("Enter email and password");
    return;
  }
```

**Рекомендация:** Добавить inline-валидацию email формата:
```typescript
const [emailError, setEmailError] = useState<string | null>(null);

const validateEmail = (text: string) => {
  const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
  setEmailError(isValid ? null : "Неверный формат email");
  setEmail(text);
};
```

#### 1.2 Нет "Показать пароль" (LOW)
**Рекомендация:** Добавить toggle для secureTextEntry:
```tsx
<TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
  <Text>{showPassword ? "🙈" : "👁️"}</Text>
</TouchableOpacity>
```

#### 1.3 Нет "Забыли пароль?" (MEDIUM)
**Рекомендация:** Добавить ссылку с заглушкой для будущей реализации.

#### 1.4 Accessibility (A11y)
- Нет `accessibilityLabel` на полях ввода
- Нет `accessibilityRole="button"` на кнопках

---

## 2. Экран регистрации (RegisterScreen)

### Текущее состояние
- Зеркальная структура LoginScreen
- Валидация минимальной длины пароля (6 символов)

### Выявленные проблемы

#### 2.1 Нет индикатора силы пароля (MEDIUM)
**Рекомендация:** Добавить визуальный индикатор:
```tsx
const getPasswordStrength = (password: string) => {
  if (password.length < 6) return { level: 0, label: "Слишком короткий", color: "#f87171" };
  if (password.length < 10 && !/[A-Z]/.test(password)) return { level: 1, label: "Слабый", color: "#fbbf24" };
  if (/[A-Z]/.test(password) && /[0-9]/.test(password)) return { level: 3, label: "Сильный", color: "#22c55e" };
  return { level: 2, label: "Средний", color: "#38bdf8" };
};
```

#### 2.2 Нет подтверждения пароля (LOW)
**Рекомендация:** Добавить второе поле для подтверждения пароля.

#### 2.3 Нет Terms & Conditions checkbox (MEDIUM для production)
**Рекомендация:** Добавить обязательный чекбокс перед регистрацией.

---

## 3. Dashboard Screen (Главный экран)

### Текущее состояние
- Комплексный экран с множеством карточек данных
- Pull-to-refresh функциональность
- Модальные окна для редактирования

### Критические проблемы

#### 3.1 Информационная перегруженность (HIGH)
Экран содержит 5+ карточек с данными без чёткой визуальной иерархии:
- Nutrition
- Sleep & Health
- Fitness (CTL/ATL/TSB)
- Training (последние 14 дней)
- Analysis Result

**Рекомендация:** Реорганизовать с помощью табов или свайпа:
```tsx
<TabView
  tabs={["Сегодня", "Питание", "Тренировки", "Здоровье"]}
  renderScene={({ route }) => {
    switch (route.key) {
      case 'today': return <TodaySummaryCard />;
      case 'nutrition': return <NutritionDetailCard />;
      // ...
    }
  }}
/>
```

#### 3.2 Хардкодированные цели питания (CRITICAL)
```typescript
const CALORIE_GOAL = 2200;
const CARBS_GOAL = 250;
const PROTEIN_GOAL = 120;
const FAT_GOAL = 80;
```

**Рекомендация:** Хранить в профиле пользователя, загружать с backend:
```typescript
const [nutritionGoals, setNutritionGoals] = useState<NutritionGoals | null>(null);

useEffect(() => {
  getAthleteProfile().then(profile => {
    setNutritionGoals(profile.nutrition_goals ?? defaultGoals);
  });
}, []);
```

#### 3.3 Отсутствие прогресс-баров для макросов (MEDIUM)
Текущее отображение:
```
Logged: 1500 kcal · P 80g · F 50g · C 150g
Remainder: 700 kcal · Carbs 100g · P 40g · F 30g
```

**Рекомендация:** Добавить визуальные прогресс-бары:
```tsx
const NutritionProgressBar = ({ current, goal, label, color }: Props) => {
  const percent = Math.min((current / goal) * 100, 100);
  return (
    <View style={styles.progressContainer}>
      <View style={styles.progressLabelRow}>
        <Text style={styles.progressLabel}>{label}</Text>
        <Text style={styles.progressValue}>{current}/{goal}</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${percent}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
};
```

#### 3.4 Смешение языков (MEDIUM)
Интерфейс смешивает русский и английский:
- "Сон и здоровье" + "Nutrition (goal remainder)"
- "Изменить" + "Log out"

**Рекомендация:** Унифицировать язык и добавить i18n:
```typescript
import { useTranslation } from 'react-i18next';

const { t } = useTranslation();
<Text>{t('dashboard.nutrition.title')}</Text>
```

#### 3.5 FAB (Floating Action Button) закрывает контент (LOW)
```typescript
fab: {
  position: "absolute",
  bottom: 24,
  right: 20,
  // ...
}
```

**Рекомендация:** Добавить достаточный `paddingBottom` в ScrollView или сделать FAB скрываемым при скролле.

#### 3.6 Нет pull-to-refresh индикатора состояния (LOW)
**Рекомендация:** Показывать toast/snackbar после успешного обновления:
```tsx
const onRefresh = async () => {
  setRefreshing(true);
  await load();
  setRefreshing(false);
  showToast("Данные обновлены");
};
```

---

## 4. Camera Screen (Фото для анализа)

### Текущее состояние
- Двухэтапный flow: выбор фото → просмотр результата → сохранение
- Автоопределение типа контента (еда vs сон)
- Dev-лог для отладки

### Выявленные проблемы

#### 4.1 Нет предпросмотра выбранного изображения (HIGH)
После выбора фото пользователь не видит само изображение, только результат анализа.

**Рекомендация:** Добавить thumbnail выбранного фото:
```tsx
{photoResult && (
  <View style={styles.result}>
    {selectedPhotoUri && (
      <Image 
        source={{ uri: selectedPhotoUri }} 
        style={styles.photoThumbnail} 
        resizeMode="cover"
      />
    )}
    <Text style={styles.resultName}>{photoResult.food.name}</Text>
    {/* ... */}
  </View>
)}
```

#### 4.2 Нет возможности редактирования результата перед сохранением (MEDIUM)
Если AI неправильно распознал блюдо, пользователь не может исправить данные.

**Рекомендация:** Добавить inline-редактирование на этапе preview:
```tsx
<TextInput
  style={styles.editableInput}
  value={editedName}
  onChangeText={setEditedName}
  placeholder="Название блюда"
/>
<TextInput
  style={styles.editableInput}
  value={String(editedCalories)}
  onChangeText={(t) => setEditedCalories(Number(t))}
  keyboardType="numeric"
  placeholder="Калории"
/>
```

#### 4.3 Нет выбора типа приёма пищи (MEDIUM)
```typescript
await createNutritionEntry({
  // ...
  meal_type: "other",  // Всегда "other"!
```

**Рекомендация:** Добавить выбор типа до сохранения:
```tsx
const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"];

{photoResult?.type === "food" && (
  <View style={styles.mealTypeSelector}>
    {MEAL_TYPES.map(type => (
      <TouchableOpacity
        key={type}
        style={[styles.mealTypeBtn, selectedMealType === type && styles.mealTypeBtnActive]}
        onPress={() => setSelectedMealType(type)}
      >
        <Text>{getMealTypeLabel(type)}</Text>
      </TouchableOpacity>
    ))}
  </View>
)}
```

#### 4.4 Анимация загрузки не информативна (LOW)
**Рекомендация:** Показывать этапы обработки:
```tsx
const [loadingStage, setLoadingStage] = useState<'uploading' | 'analyzing' | null>(null);

{loading && (
  <View style={styles.loadingContainer}>
    <ActivityIndicator size="large" color="#38bdf8" />
    <Text style={styles.loadingText}>
      {loadingStage === 'uploading' ? 'Загрузка фото...' : 'Анализ с AI...'}
    </Text>
    <Text style={styles.loadingHint}>Обычно это занимает 3-5 секунд</Text>
  </View>
)}
```

---

## 5. Chat Screen (AI Coach)

### Текущее состояние
- История сообщений из backend
- Отправка текстовых сообщений
- Кнопка быстрого запроса решения (Go/Modify/Skip)

### Выявленные проблемы

#### 5.1 Нет timestamps на сообщениях (MEDIUM)
```typescript
<View style={[styles.bubble, item.role === "user" ? styles.userBubble : styles.assistantBubble]}>
  <Text style={styles.bubbleText}>{item.content}</Text>
  {/* Нет времени! */}
</View>
```

**Рекомендация:**
```tsx
<View style={styles.bubble}>
  <Text style={styles.bubbleText}>{item.content}</Text>
  {item.timestamp && (
    <Text style={styles.bubbleTime}>
      {formatTime(item.timestamp)}
    </Text>
  )}
</View>
```

#### 5.2 Нет typing indicator (LOW)
**Рекомендация:** Показывать "AI думает..." во время загрузки ответа:
```tsx
{loading && (
  <View style={[styles.bubble, styles.assistantBubble, styles.typingBubble]}>
    <Text style={styles.typingText}>AI Coach печатает...</Text>
    <ActivityIndicator size="small" color="#94a3b8" />
  </View>
)}
```

#### 5.3 Нет быстрых вопросов/подсказок (MEDIUM)
**Рекомендация:** Добавить chips с частыми вопросами:
```tsx
const QUICK_PROMPTS = [
  "Как прошла моя неделя?",
  "Что съесть перед тренировкой?",
  "Нужен ли мне отдых?",
];

<ScrollView horizontal style={styles.quickPrompts}>
  {QUICK_PROMPTS.map(prompt => (
    <TouchableOpacity 
      key={prompt}
      style={styles.quickPromptChip}
      onPress={() => setInput(prompt)}
    >
      <Text style={styles.quickPromptText}>{prompt}</Text>
    </TouchableOpacity>
  ))}
</ScrollView>
```

#### 5.4 Кнопка "Get today's decision" внизу экрана плохо видна (LOW)
```typescript
orchBtn: { padding: 12, alignItems: "center" },
orchBtnText: { fontSize: 14, color: "#94a3b8" },  // Слабый контраст
```

**Рекомендация:** Сделать более заметной:
```typescript
orchBtn: {
  padding: 16,
  backgroundColor: "#16213e",
  borderRadius: 12,
  borderWidth: 1,
  borderColor: "#38bdf8",
  marginHorizontal: 12,
  marginBottom: 12,
  alignItems: "center",
},
orchBtnText: { fontSize: 16, color: "#38bdf8", fontWeight: "600" },
```

---

## 6. Strava Link Screen

### Текущее состояние
- Чёткий статус подключения
- OAuth flow через внешний браузер
- Возможность отключения

### Выявленные проблемы

#### 6.1 Нет автоматической проверки статуса после возврата (MEDIUM)
После авторизации в браузере пользователь должен вручную нажать "Check connection".

**Рекомендация:** Использовать `AppState` для автоматической проверки:
```typescript
useEffect(() => {
  const subscription = AppState.addEventListener('change', nextAppState => {
    if (nextAppState === 'active') {
      loadStatus();
    }
  });
  return () => subscription.remove();
}, [loadStatus]);
```

#### 6.2 Warning hint жёлтого цвета плохо читается (LOW)
```typescript
warningHint: { fontSize: 13, color: "#fbbf24", marginBottom: 16 },
```

**Рекомендация:** Добавить фон для лучшей читаемости:
```typescript
warningHint: {
  fontSize: 13,
  color: "#fbbf24",
  marginBottom: 16,
  backgroundColor: "rgba(251, 191, 36, 0.1)",
  padding: 12,
  borderRadius: 8,
  borderLeftWidth: 3,
  borderLeftColor: "#fbbf24",
},
```

---

## 7. Strava Activity Screen

### Текущее состояние
- Календарь с отмеченными днями тренировок
- Навигация по месяцам
- Детали при выборе дня

### Выявленные проблемы

#### 7.1 Детали активности скрыты по умолчанию (MEDIUM)
Нужно тапнуть на активность, чтобы увидеть детали.

**Рекомендация:** Показывать основные детали сразу:
```tsx
<View style={styles.activityCard}>
  <View style={styles.activityHeader}>
    <Text style={styles.activityName}>{act.name || "Workout"}</Text>
    {act.type && <View style={styles.activityTypeBadge}><Text>{act.type}</Text></View>}
  </View>
  <View style={styles.activityStats}>
    {act.duration_sec && <StatBadge icon="⏱" value={formatDuration(act.duration_sec)} />}
    {act.distance_km && <StatBadge icon="📍" value={`${act.distance_km} km`} />}
    {act.tss && <StatBadge icon="💪" value={`TSS ${Math.round(act.tss)}`} />}
  </View>
</View>
```

#### 7.2 Нет визуального различия типов тренировок (LOW)
**Рекомендация:** Цветовая кодировка по типу:
```typescript
const getActivityColor = (type: string | undefined) => {
  switch (type?.toLowerCase()) {
    case 'run': return '#22c55e';
    case 'ride': return '#f59e0b';
    case 'swim': return '#3b82f6';
    case 'workout': return '#8b5cf6';
    default: return '#64748b';
  }
};
```

#### 7.3 Нет недельной статистики (MEDIUM)
**Рекомендация:** Добавить summary вверху:
```tsx
<View style={styles.weekSummary}>
  <Text style={styles.weekSummaryTitle}>Эта неделя</Text>
  <View style={styles.weekStats}>
    <StatItem label="Тренировок" value={weekActivities.length} />
    <StatItem label="Часов" value={totalHours.toFixed(1)} />
    <StatItem label="TSS" value={totalTSS} />
  </View>
</View>
```

---

## 8. Athlete Profile Screen

### Текущее состояние
- Аватар из Strava
- Редактируемые поля (вес, рост, год рождения, FTP)
- Синхронизация со Strava

### Выявленные проблемы (минимальные)

#### 8.1 Нет валидации полей в режиме редактирования (LOW)
**Рекомендация:** Добавить inline-валидацию при вводе.

#### 8.2 Нет подтверждения при сохранении (LOW)
**Рекомендация:** Добавить success toast после сохранения.

#### 8.3 Кнопка "Update from Strava" выглядит как primary action (LOW)
Оранжевая кнопка Strava привлекает больше внимания, чем основные действия.

**Рекомендация:** Сделать её менее выразительной или переместить вниз.

---

## 9. Wellness Screen

### Текущее состояние
- Календарь для выбора даты
- Поля ввода: сон, RHR, HRV
- Отображение CTL/ATL/TSB (read-only)

### Выявленные проблемы

#### 9.1 Нет визуализации трендов (HIGH)
Данные показываются только за один день.

**Рекомендация:** Добавить мини-графики:
```tsx
import { LineChart } from 'react-native-chart-kit';

<View style={styles.trendChart}>
  <Text style={styles.chartTitle}>Сон за 7 дней</Text>
  <LineChart
    data={{
      labels: lastWeekDates,
      datasets: [{ data: sleepData }]
    }}
    width={screenWidth - 40}
    height={120}
    chartConfig={chartConfig}
  />
</View>
```

#### 9.2 Нет быстрого ввода через слайдеры (MEDIUM)
**Рекомендация:** Для сна — слайдер 0-12 часов:
```tsx
<Slider
  minimumValue={0}
  maximumValue={12}
  step={0.5}
  value={sleepHoursNum}
  onValueChange={v => setSleepHours(String(v))}
/>
<Text>{sleepHoursNum}h</Text>
```

#### 9.3 Нет интеграции с данными часов/трекеров (future)
**Рекомендация:** Добавить возможность импорта из Apple Health / Google Fit.

---

## 10. Intervals Link Screen

### Текущее состояние
- Форма ввода Athlete ID и API Key
- Статус подключения
- Возможность отключения

### Выявленные проблемы

#### 10.1 Требует ручного копирования данных (HIGH)
Пользователь должен идти на intervals.icu, находить настройки, копировать ключи.

**Рекомендация:** Добавить пошаговую инструкцию со скриншотами или OAuth (если поддерживается).

#### 10.2 API Key показывается звёздочками даже при вводе (LOW)
**Рекомендация:** Добавить toggle "показать ключ".

---

## Общие проблемы интерфейса

### A. Цветовая схема и контраст

#### A.1 Недостаточный контраст hint-текста (MEDIUM)
```typescript
hint: { fontSize: 12, color: "#64748b", marginTop: 4 },
```
Цвет `#64748b` на фоне `#1a1a2e` имеет контраст ~3.5:1 (рекомендуется 4.5:1 для мелкого текста).

**Рекомендация:** Использовать `#94a3b8` для hints.

#### A.2 Единственный акцентный цвет (LOW)
Весь интерфейс использует только `#38bdf8` (голубой) для интерактивных элементов.

**Рекомендация:** Добавить семантические цвета:
```typescript
const colors = {
  primary: '#38bdf8',     // Основные действия
  success: '#22c55e',     // Успешные операции, "Go"
  warning: '#f59e0b',     // Предупреждения, "Modify"
  danger: '#ef4444',      // Ошибки, удаление, "Skip"
  info: '#6366f1',        // Информация
};
```

### B. Типографика

#### B.1 Нет системы типографики (MEDIUM)
Размеры шрифтов заданы hardcoded в каждом экране.

**Рекомендация:** Создать централизованную систему:
```typescript
// src/theme/typography.ts
export const typography = {
  h1: { fontSize: 28, fontWeight: '700' as const, lineHeight: 34 },
  h2: { fontSize: 22, fontWeight: '700' as const, lineHeight: 28 },
  h3: { fontSize: 18, fontWeight: '600' as const, lineHeight: 24 },
  body: { fontSize: 16, fontWeight: '400' as const, lineHeight: 22 },
  caption: { fontSize: 12, fontWeight: '400' as const, lineHeight: 16 },
};
```

### C. Отзывчивость и адаптивность

#### C.1 Фиксированные значения padding/margin (LOW)
**Рекомендация:** Использовать относительные единицы для адаптации к разным экранам:
```typescript
import { Dimensions } from 'react-native';
const { width } = Dimensions.get('window');
const isTablet = width >= 768;

const dynamicPadding = isTablet ? 32 : 20;
```

### D. Состояния загрузки и ошибок

#### D.1 Нет skeleton-экранов (MEDIUM)
При загрузке данных показывается только spinner.

**Рекомендация:** Использовать skeleton placeholders:
```tsx
{loading ? (
  <View style={styles.skeletonCard}>
    <View style={styles.skeletonTitle} />
    <View style={styles.skeletonText} />
    <View style={styles.skeletonText} />
  </View>
) : (
  <ActualContent data={data} />
)}
```

#### D.2 Ошибки сети показываются как Alert (MEDIUM)
```typescript
Alert.alert("Error", msg);
```

**Рекомендация:** Использовать inline-сообщения или toast:
```tsx
{error && (
  <View style={styles.errorBanner}>
    <Text style={styles.errorText}>{error}</Text>
    <TouchableOpacity onPress={retry}>
      <Text style={styles.retryText}>Повторить</Text>
    </TouchableOpacity>
  </View>
)}
```

### E. Навигация

#### E.1 Нет bottom navigation (MEDIUM)
Все переходы через ссылки внутри Dashboard.

**Рекомендация:** Добавить Tab Navigator для основных разделов:
```tsx
<Tab.Navigator>
  <Tab.Screen name="Home" component={DashboardScreen} />
  <Tab.Screen name="Activity" component={StravaActivityScreen} />
  <Tab.Screen name="Chat" component={ChatScreen} />
  <Tab.Screen name="Profile" component={AthleteProfileScreen} />
</Tab.Navigator>
```

#### E.2 Нет глубоких ссылок (LOW)
**Рекомендация:** Добавить поддержку deep linking для push-уведомлений.

---

## Приоритизированный план улучшений

### Phase 1 — Критические улучшения (1-3 дня)

| # | Задача | Приоритет | Экран |
|---|--------|-----------|-------|
| 1 | Прогресс-бары для макронутриентов | HIGH | Dashboard |
| 2 | Предпросмотр фото перед анализом | HIGH | Camera |
| 3 | Унификация языка интерфейса | HIGH | Все |
| 4 | Настраиваемые цели питания (UI) | HIGH | Dashboard |
| 5 | Timestamps в чате | MEDIUM | Chat |
| 6 | Визуализация трендов wellness | HIGH | Wellness |

### Phase 2 — UX улучшения (3-7 дней)

| # | Задача | Приоритет | Экран |
|---|--------|-----------|-------|
| 7 | Bottom Tab Navigator | MEDIUM | App |
| 8 | Выбор типа приёма пищи | MEDIUM | Camera |
| 9 | Редактирование результата AI до сохранения | MEDIUM | Camera |
| 10 | Quick prompts в чате | MEDIUM | Chat |
| 11 | Skeleton загрузки | MEDIUM | Все |
| 12 | Автопроверка статуса Strava при возврате | MEDIUM | StravaLink |

### Phase 3 — Доработки (7-14 дней)

| # | Задача | Приоритет | Экран |
|---|--------|-----------|-------|
| 13 | Система типографики | LOW | Все |
| 14 | Семантические цвета | LOW | Все |
| 15 | i18n (интернационализация) | LOW | Все |
| 16 | Accessibility labels | LOW | Все |
| 17 | Onboarding flow для новых пользователей | MEDIUM | App |
| 18 | Dark/Light theme toggle | LOW | App |

---

## Технический долг UI

### Дублирование стилей
Каждый экран имеет свой `StyleSheet.create()` с повторяющимися стилями. 

**Рекомендация:** Создать общую библиотеку компонентов:
```
src/
  components/
    Button.tsx       // Primary, Secondary, Danger
    Card.tsx         // Стандартная карточка
    Input.tsx        // Поля ввода
    ProgressBar.tsx  // Прогресс-бар
  theme/
    colors.ts
    typography.ts
    spacing.ts
```

### Hardcoded строки
Все тексты захардкодены в компонентах.

**Рекомендация:** Использовать i18n:
```bash
npm install i18next react-i18next
```

### Отсутствие error boundaries
**Рекомендация:** Добавить React Error Boundaries для graceful degradation.

---

## Заключение

Интерфейс tssproAI представляет собой функциональный MVP с хорошей базовой структурой и современной тёмной темой. Основные проблемы связаны с:

1. **Информационной перегруженностью** — Dashboard содержит слишком много данных без чёткой иерархии
2. **Отсутствием визуализации** — числовые данные показываются текстом без графиков и прогресс-баров
3. **Неполным UX flow** — например, нет предпросмотра фото, нет выбора типа приёма пищи
4. **Смешением языков** — интерфейс использует и русский, и английский

Реализация Phase 1 улучшений (1-3 дня работы) значительно повысит usability приложения. Phase 2 подготовит приложение к публичному тестированию.

**Общая оценка готовности UI к production: 65%**

Для достижения 90%+ готовности необходимо выполнить Phase 1 и Phase 2, а также добавить onboarding flow для новых пользователей.
