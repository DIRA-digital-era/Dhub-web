
export const openDatabase = () => ({
  execute: () => Promise.resolve(),
  close: () => {},
});
export default { openDatabase };
