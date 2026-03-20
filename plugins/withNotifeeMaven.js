const { withProjectBuildGradle } = require('@expo/config-plugins');

module.exports = function withNotifeeMaven(config) {
  return withProjectBuildGradle(config, (config) => {
    if (config.modResults.language === 'groovy') {
      const buildGradle = config.modResults.contents;
      const notifeeMavenUrl = `maven { url "$rootDir/../node_modules/@notifee/react-native/android/libs" }`;

      if (!buildGradle.includes('notifee/react-native/android/libs')) {
        config.modResults.contents = buildGradle.replace(
          /mavenCentral\(\)/g,
          `mavenCentral()\n        ${notifeeMavenUrl}`
        );
      }
    }
    return config;
  });
};
