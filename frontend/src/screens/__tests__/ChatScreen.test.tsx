import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import { ChatScreen } from "../ChatScreen";
import { ThemeProvider } from "../../theme";
import { I18nProvider } from "../../i18n";

jest.mock("@expo/vector-icons", () => {
  const { View } = require("react-native");
  return { Ionicons: View };
});

jest.mock("../../api/client", () => ({
  getChatHistory: jest.fn().mockResolvedValue([]),
  sendChatMessage: jest.fn().mockResolvedValue({ reply: "" }),
  sendChatMessageWithFit: jest.fn().mockResolvedValue({ reply: "" }),
  sendChatMessageWithImage: jest.fn().mockResolvedValue({ reply: "" }),
  runOrchestrator: jest.fn().mockResolvedValue({}),
  getChatThreads: jest.fn().mockResolvedValue({
    items: [{ id: 1, title: "Test", created_at: "2026-01-01T00:00:00Z" }],
    total: 1,
  }),
  createChatThread: jest.fn().mockResolvedValue({ id: 1, title: "Test", created_at: "2026-01-01T00:00:00Z" }),
  updateChatThread: jest.fn().mockResolvedValue({}),
  clearChatThread: jest.fn().mockResolvedValue(undefined),
  deleteChatThread: jest.fn().mockResolvedValue(undefined),
}));

describe("ChatScreen", () => {
  it("renders chat screen with input", async () => {
    const { getByPlaceholderText } = render(
      <ThemeProvider>
        <I18nProvider>
          <ChatScreen user={null} onClose={jest.fn()} />
        </I18nProvider>
      </ThemeProvider>
    );
    await waitFor(() => {
      expect(getByPlaceholderText("Сообщение или прикрепите FIT...")).toBeTruthy();
    });
  });

  it("shows FIT and Photo buttons when user is premium", async () => {
    const premiumUser = { id: 1, email: "u@test.com", is_premium: true };
    const { getByText } = render(
      <ThemeProvider>
        <I18nProvider>
          <ChatScreen user={premiumUser} onClose={jest.fn()} />
        </I18nProvider>
      </ThemeProvider>
    );
    await waitFor(() => {
      expect(getByText("FIT")).toBeTruthy();
      expect(getByText("Фото")).toBeTruthy();
    });
  });
});
