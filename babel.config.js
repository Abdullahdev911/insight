module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    plugins: [
      // Required for Reanimated (and NativeWind animations)
      // THIS MUST BE THE LAST ITEM IN THE ARRAY
      "react-native-reanimated/plugin", 
    ],
  };
};