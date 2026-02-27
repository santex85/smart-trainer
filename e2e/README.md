# E2E (Maestro)

Smoke flow: `e2e/register_and_analyze.yaml`.

Run locally:

```bash
maestro test e2e/register_and_analyze.yaml
```

Notes:
- `appId` is `com.smarttrainer.app` from `frontend/app.json`.
- Add stable `testID` props in React Native components for robust selectors (`email-input`, `password-input`).
