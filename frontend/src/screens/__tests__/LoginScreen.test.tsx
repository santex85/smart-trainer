import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { LoginScreen } from "../LoginScreen";

jest.mock("../../api/client", () => ({
  login: jest.fn().mockResolvedValue({
    access_token: "tok",
    refresh_token: "ref",
    user: { id: 1, email: "test@test.com" },
  }),
}));
jest.mock("../../storage/authStorage", () => ({
  setAccessToken: jest.fn().mockResolvedValue(undefined),
  setRefreshToken: jest.fn().mockResolvedValue(undefined),
}));

describe("LoginScreen", () => {
  it("renders email and password fields", () => {
    const { getByPlaceholderText, getByText } = render(
      <LoginScreen onSuccess={jest.fn()} onGoToRegister={jest.fn()} />
    );
    expect(getByPlaceholderText("you@example.com")).toBeTruthy();
    expect(getByPlaceholderText("••••••••")).toBeTruthy();
    expect(getByText("Вход")).toBeTruthy();
    expect(getByText("Создать аккаунт")).toBeTruthy();
  });

  it("shows error on empty submit", async () => {
    const { getByText } = render(
      <LoginScreen onSuccess={jest.fn()} onGoToRegister={jest.fn()} />
    );
    fireEvent.press(getByText("Войти"));
    await waitFor(() => {
      expect(getByText("Введите email и пароль")).toBeTruthy();
    });
  });

  it("calls onSuccess after successful login", async () => {
    const onSuccess = jest.fn();
    const { getByPlaceholderText, getByText } = render(
      <LoginScreen onSuccess={onSuccess} onGoToRegister={jest.fn()} />
    );
    fireEvent.changeText(getByPlaceholderText("you@example.com"), "u@t.com");
    fireEvent.changeText(getByPlaceholderText("••••••••"), "pass123");
    fireEvent.press(getByText("Войти"));
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, email: "test@test.com" })
      );
    });
  });
});
