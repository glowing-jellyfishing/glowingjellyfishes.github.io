export type DefaultMessages = Record<"appName" | "statusCode" | "statusMessage" | "description" | "refresh", string | boolean | number>;
export declare const template: (messages: Partial<DefaultMessages>) => string;
