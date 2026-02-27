import "@testing-library/jest-native/extend-expect";

jest.mock(
    "@react-native-async-storage/async-storage",
    () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

jest.mock(
    "expo-haptics",
    () => ({
        impactAsync: jest.fn(),
        notificationAsync: jest.fn(),
        ImpactFeedbackStyle: { Light: "Light", Medium: "Medium", Heavy: "Heavy" },
        NotificationFeedbackType: { Success: "Success", Warning: "Warning", Error: "Error" },
    }),
    { virtual: true },
);
