import { CrashlyticsPlugin } from '.';
export interface Android extends CrashlyticsPlugin {
}
export interface IOS extends CrashlyticsPlugin {
}
export declare function getInstance(T: new () => CrashlyticsPlugin): CrashlyticsPlugin;
