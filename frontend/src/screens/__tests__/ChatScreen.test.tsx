import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import { ChatScreen } from "../ChatScreen";
import { ThemeProvider } from "../../theme";

jest.mock("../../api/client", () => ({
  getChatHistory: jest.fn().mockResolvedValue([]),
  sendChatMessage: jest.fn().mockResolvedValue({}),
  sendChatMessageWithFit: jest.fn().mockResolvedValue({}),
  runOrchestrator: jest.fn().mockResolvedValue({}),
  getChatThreads: jest.fn().mockResolvedValue({ items: [], total: 0 }),
  createChatThread: jest.fn().mockResolvedValue({ id: 1 }),
  clearChatThread: jest.fn().mockResolvedValue(undefined),
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
