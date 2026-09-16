export const formatFollowers = (value: number) => `${(value / 1000).toFixed(value >= 100000 ? 0 : 1).replace(".", ",")} mil`;
