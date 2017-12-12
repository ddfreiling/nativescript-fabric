var fs = require('fs');
var path = require('path');
var prompt = require('prompt-lite');

// Default settings for using ios and android with Fabric
var usingiOS = false,
    usingAndroid = false;

// The directories where the Podfile and include.gradle are stored
var directories = {
    ios: './platforms/ios',
    android: './platforms/android'
};

console.log('NativeScript Fabric Plugin Installation');

var appRoot = "../../";
var pluginConfigFile = "fabric.json";
var pluginConfigPath = path.join(appRoot, pluginConfigFile);
var config = {};

function mergeConfig(result) {
    for (var key in result) {
        config[key] = result[key];
    }
}

function saveConfig() {
    fs.writeFileSync(pluginConfigPath, JSON.stringify(config, null, 4));
}

function readConfig() {
    try {
        config = JSON.parse(fs.readFileSync(pluginConfigPath));
    } catch (e) {
        console.log("Failed reading " + pluginConfigFile);
        console.log(e);
        config = {};
    }
}

function isInteractive() {
    return process.stdin && process.stdin.isTTY && process.stdout && process.stdout.isTTY;
}

// workaround for https://github.com/NativeScript/nativescript-cli/issues/2521 (2.5.0 only)
var nativeScriptVersion = "";
try {
    nativeScriptVersion = __webpack_require__( /*! child_process */ 2).execSync('nativescript --version');
} catch (err) {
    // On some environments nativescript is not in the PATH
    // Ignore the error
}

var isNativeScriptCLI250 = nativeScriptVersion.indexOf("2.5.0") !== -1;

// note that for CI builds you want a pluginConfigFile, otherwise the build will fail
if (process.argv.indexOf("config") === -1 && fs.existsSync(pluginConfigPath)) {
    readConfig();
    if (config.apiKey) {
        config.api_key = config.apiKey;
        delete config.apiKey;
        saveConfig();
    }
    if (config.apiSecret) {
        config.api_secret = config.apiSecret;
        delete config.apiSecret;
        saveConfig();
    }
    console.log("Config file exists (" + pluginConfigFile + ")");
    askiOSPromptResult(config);
    askAndroidPromptResult(config);
    promptQuestionsResult(config);
} else if (isNativeScriptCLI250 && process.argv.indexOf("setup") === -1) {
    console.log("*******************************************************************");
    console.log("*******************************************************************");
    console.log("************************** IMPORTANT: *****************************");
    console.log("*******************  with nativescript 2.5.0  *********************");
    console.log("************** now execute 'npm run setup' manually ***************");
    console.log("***** in the node_modules/nativescript-plugin-fabric folder *****");
    console.log("*******************************************************************");
    console.log("*******************************************************************");
} else if (!isInteractive()) {
    console.log("No existing " + pluginConfigFile + " config file found and terminal is not interactive! Default configuration will be used.");
} else {
    console.log("No existing " + pluginConfigFile + " config file found, so let's configure the Fabric plugin!");
    prompt.start();
    askiOSPrompt();
}

/**
 * Prompt the user if they are integrating Fabric with iOS
 */
function askiOSPrompt() {
    prompt.get({
        name: 'using_ios',
        description: 'Are you using iOS (y/n)',
        default: 'y'
    }, function(err, result) {
        if (err) {
            return console.log(err);
        }
        mergeConfig(result);
        askiOSPromptResult(result);
        askAndroidPrompt();
    });
}

function askiOSPromptResult(result) {
    if (isSelected(result.using_ios)) {
        usingiOS = true;
    }
}

/**
 * Prompt the user if they are integrating Fabric with Android
 */
function askAndroidPrompt() {
    prompt.get({
        name: 'using_android',
        description: 'Are you using Android (y/n)',
        default: 'y'
    }, function(err, result) {
        if (err) {
            return console.log(err);
        }
        mergeConfig(result);
        askAndroidPromptResult(result);
        if (usingiOS || usingAndroid) {
            promptQuestions();
        } else {
            askSaveConfigPrompt();
        }
    });
}

function askAndroidPromptResult(result) {
    if (isSelected(result.using_android)) {
        usingAndroid = true;
    }
}

/**
 * Prompt the user through the configurable Fabric add-on services
 */
function promptQuestions() {
    prompt.get([{
        name: 'api_key',
        description: 'Your Fabric API Key',
        default: ''
    }, {
        name: 'api_secret',
        description: 'Your Fabric API Secret',
        default: ''
    }], function(err, result) {
        if (err) {
            return console.log(err);
        }
        mergeConfig(result);
        promptQuestionsResult(result);
        askSaveConfigPrompt();
    });
}

function promptQuestionsResult(result) {
    if (usingiOS) {
        writePodFile(result);
        writeXcodeData(result);
    }
    if (usingAndroid) {
        writeGradleFile();
        writeFabricServiceGradleHook(result);
    }
    console.log('Fabric post install completed. To re-run this script, navigate to the root directory of `nativescript-fabric` in your `node_modules` folder and run: `npm run config`.');
}

function writeXcodeData(config) {

    console.log("Install Fabric-build-xcode hook.");

    var appName = JSON.parse(fs.readFileSync(appRoot + 'package.json')).name;

    try {
        if (!fs.existsSync(path.join(appRoot, "hooks", "after-prepare"))) {
            fs.mkdirSync(path.join(appRoot, "hooks", "after-prepare"));
        }
        var scriptContent =
            `
var fs = require('fs-extra');
var path = require('path');
var xcode = require('xcode');
var plist = require('simple-plist');

module.exports = function() {

    console.log("Configure Fabric");
    var sanitizedName = appName.split('').filter(function(c) { return /[a-zA-Z0-9]/.test(c); }).join('');
    var apiKey = "${config.api_key}";
    var apiSecret = "${config.api_secret}";
    var projectPath = path.join(__dirname, "..", "..", "platforms", "ios", sanitizedName + ".xcodeproj", "project.pbxproj");
    var plistPath = path.join(__dirname, "..", "..", "platforms", "ios", sanitizedName, sanitizedName + "-Info.plist");
    var podsPath = path.join(__dirname, "..", "..", "platforms", "ios", "Pods");
    if (fs.existsSync(buildGradlePath)) {
        var projectPathContent = fs.readFileSync(projectPath).toString();

        // already added
        if (projectPathContent.indexOf('Configure Fabric') != -1) {
            return;
        }

        var xcodeProject = xcode.project(projectPath);
        xcodeProject.parseSync();
        var options = { shellPath: '/bin/sh', shellScript: podsPath + '/Fabric/run ' + apiKey + ' ' + apiSecret };
        var buildPhase = xcodeProject.addBuildPhase([], 'PBXShellScriptBuildPhase', 'Configure Fabric', xcodeProject.getFirstTarget().uuid, options).buildPhase;
        fs.writeFileSync(projectPath, xcodeProject.writeSync());

        var appPlist = plist.readFileSync(plistPath);
        plist.Fabric = {
            APIKey: apiKey,
            Kits: [{
                KitInfo: '',
                KiteName: 'Crashlytics'
            }, {
                KitInfo: '',
                KiteName: 'Answers'
            }]
        }
        plist.writeFileSync(plistPath, appPlist);
    }
};
`;
        console.log("Writing 'Fabric-build-xcode.js' to " + appRoot + "/hooks/after-prepare");
        var scriptPath = path.join(appRoot, "hooks", "after-prepare", "Fabric-build-xcode.js");
        fs.writeFileSync(scriptPath, scriptContent);
    } catch (e) {
        console.log("Failed to install Fabric-build-xcode hook.");
        console.log(e);
        throw e;
    }
}

function askSaveConfigPrompt() {
    prompt.get({
        name: 'save_config',
        description: 'Do you want to save the selected configuration. Reinstalling the dependency will reuse the setup from: ' + pluginConfigFile + '. CI will be easier. (y/n)',
        default: 'y'
    }, function(err, result) {
        if (err) {
            return console.log(err);
        }
        if (isSelected(result.save_config)) {
            saveConfig();
        }
    });
}

/**
 * Create the iOS PodFile for installing the Fabric iOS dependencies and service dependencies
 *
 * @param {any} result The answers to the micro-service prompts
 */
function writePodFile(result) {
    if (!fs.existsSync(directories.ios)) {
        fs.mkdirSync(directories.ios);
    }
    try {
        fs.writeFileSync(directories.ios + '/Podfile',
            `use_frameworks!
pod 'Fabric'
pod 'Crashlytics'
`);
        console.log('Successfully created iOS (Pod) file.');
    } catch (e) {
        console.log('Failed to create iOS (Pod) file.');
        console.log(e);
        throw e;
    }
}

/**
 * Create the Android Gradle for installing the Fabric Android dependencies and service dependencies
 *
 * @param {any} result The answers to the micro-service prompts
 */
function writeGradleFile() {
    if (!fs.existsSync(directories.android)) {
        fs.mkdirSync(directories.android);
    }
    try {
        fs.writeFileSync(directories.android + '/include.gradle',
            `
android {
  productFlavors {
    "nativescript-fabric" {
      dimension "nativescript-fabric"
    }
  }
}

repositories {
  mavenCentral()
  maven { url 'https://maven.fabric.io/public' }
}

dependencies {
  compile('com.crashlytics.sdk.android:crashlytics:2.8.0@aar') {
    transitive = true;
  }
}

`);
        console.log('Successfully created Android (include.gradle) file.');
    } catch (e) {
        console.log('Failed to create Android (include.gradle) file.');
        console.log(e);
        throw e;
    }
}

/**
 * Create dev tools gradle runtime entry
 */
function writeFabricServiceGradleHook(config) {
    console.log("Install Fabric-build-gradle hook.");
    try {
        if (!fs.existsSync(path.join(appRoot, "hooks", "after-prepare"))) {
            fs.mkdirSync(path.join(appRoot, "hooks", "after-prepare"));
        }
        var scriptContent =
            `
var path = require("path");
var fs = require("fs");

module.exports = function() {

    console.log("Configure Fabric");
    var apiKey = "${config.api_key}";
    var apiSecret = "${config.api_secret}";
    var buildGradlePath = path.join(__dirname, "..", "..", "platforms", "android", "build.gradle");
    var settingsJson = path.join(__dirname, "..", "..", "platforms", "android", "src", "main", "res", "fabric.properties");
    if (fs.existsSync(buildGradlePath)) {
        var buildGradleContent = fs.readFileSync(buildGradlePath).toString();

        // already added
        if (buildGradleContent.indexOf('io.fabric.tools:gradle') != -1) {
            return;
        }

        buildGradleContent+='buildscript {\\n';
        buildGradleContent+=' repositories {\\n';
        buildGradleContent+='   maven { url "https://maven.fabric.io/public" }\\n';
        buildGradleContent+=' }\\n';
        buildGradleContent+=' dependencies {\\n';
        buildGradleContent+='   classpath "io.fabric.tools:gradle:1.+"\\n';
        buildGradleContent+=' }\\n';
        buildGradleContent+='}\\n';
        buildGradleContent+='\\n';
        buildGradleContent+='apply plugin: "io.fabric"\\n';

        fs.writeFileSync(buildGradlePath, buildGradleContent);

        var propertiesContent = '# Contains API Secret used to validate your application. Commit to internal source control; avoid making secret public';
        propertiesContent+='apiKey = ' + apiKey + '\\n';
        propertiesContent+='apiSecret = ' + apiSecret + '\\n';

        fs.writeFileSync(settingsJson, propertiesContent);
    }
};
`;
        console.log("Writing 'Fabric-build-gradle.js' to " + appRoot + "hooks/after-prepare");
        var scriptPath = path.join(appRoot, "hooks", "after-prepare", "Fabric-build-gradle.js");
        fs.writeFileSync(scriptPath, scriptContent);
    } catch (e) {
        console.log("Failed to install Fabric-build-gradle hook.");
        console.log(e);
        throw e;
    }
}

/**
 * Determines if the answer validates as selected
 *
 * @param {any} value The user input for a prompt
 * @returns {boolean} The answer is yes, {false} The answer is no
 */
function isSelected(value) {
    return value === true || (typeof value === "string" && value.toLowerCase() === 'y');
}

function isPresent(value) {
    return value !== undefined;
}