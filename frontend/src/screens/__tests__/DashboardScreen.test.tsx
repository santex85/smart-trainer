import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import { DashboardScreen } from "../DashboardScreen";

jest.mock("../../api/client", () => ({
  getNutritionDay: jest.fn().mockResolvedValue({
    date: "2026-02-27",
    entries: [],
    totals: { calories: 0, protein_g: 0, fat_g: 0, carbs_g: 0 },
  }),
  updateNutritionEntry: jest.fn().mockResolvedValue({}),
  deleteNutritionEntry: jest.fn().mockResolvedValue(undefined),
  runOrchestrator: jest.fn().mockResolvedValue({}),
  getWellness: jest.fn().mockResolvedValue({ items: [], total: 0 }),
  createOrUpdateWellness: jest.fn().mockResolvedValue({}),
  getAthleteProfile: jest.fn().mockResolvedValue({
    weight_kg: null,
    ftp: null,
    display_name: "Test",
  }),
  updateAthleteProfile: jest.fn().mockResolvedValue({}),
  getWorkouts: jest.fn().mockResolvedValue({ items: [], total: 0 }),
  getWorkoutFitness: jest.fn().mockResolvedValue(null),
  createWorkout: jest.fn().mockResolvedValue({}),
  uploadFitWorkout: jest.fn().mockResolvedValue({}),
}));

describe("DashboardScreen", () => {
  it("renders dashboard title and main sections", async () => {
    const { getByText } = render(
      <DashboardScreen
        user={{ id: 1, email: "test@test.com" }}
        onLogout={jest.fn()}
        onOpenCamera={jest.fn()}
        onOpenChat={jest.fn()}
      />
    );
    await waitFor(() => {
      expect(getByText("Smart Trainer")).toBeTruthy();
    });
  });
});
