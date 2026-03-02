import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import { ChatScreen } from "../ChatScreen";
import { ThemeProvider } from "../../theme";

jest.mock("@expo/vector-icons", () => {
  const { View } = require("react-native");
  return { Ionicons: View };
});

jest.mock("../../api/client", () => ({
  getChatHistory: jest.fn().mockResolvedValue([]),
  sendChatMessage: jest.fn().mockResolvedValue({}),
  sendChatMessageWithFit: jest.fn().mockResolvedValue({}),
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
        <ChatScreen onClose={jest.fn()} />
      </ThemeProvider>
    );
    await waitFor(() => {
      expect(getByPlaceholderText("Сообщение или прикрепите FIT...")).toBeTruthy();
    });
  });
});
