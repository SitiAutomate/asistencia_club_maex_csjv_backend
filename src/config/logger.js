import colors from 'colors';

export const logger = {
  info: (message) => console.log(colors.cyan(`[INFO] ${message}`)),
  success: (message) => console.log(colors.green(`[OK] ${message}`)),
  warn: (message) => console.log(colors.yellow(`[WARN] ${message}`)),
  error: (message) => console.error(colors.red(`[ERROR] ${message}`)),
};
