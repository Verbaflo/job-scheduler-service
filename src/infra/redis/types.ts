interface RedisSetKeyInput {
  key: string;
  value: any;
  ttlInSeconds: number;
  nx?: boolean;
}

export { RedisSetKeyInput };
