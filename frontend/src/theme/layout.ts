import { Platform } from "react-native";

/** Page content wrapper: on web limits width to 960px and centers; on native no constraint. */
export const contentWrap = Platform.select({
  web: { maxWidth: 960, width: "100%" as const, alignSelf: "center" as const },
  default: {},
});
