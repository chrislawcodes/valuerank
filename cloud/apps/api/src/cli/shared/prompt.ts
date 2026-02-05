import * as readline from 'readline';
import { ValidationError } from '@valuerank/shared';

export function promptLine(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export function requireTty(isTty: boolean): void {
  if (!isTty) {
    throw new ValidationError(
      'Refusing to read password from non-TTY input. Run this command in an interactive terminal.'
    );
  }
}

export function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;

    requireTty(Boolean(stdin.isTTY));

    stdout.write(question);
    stdin.setEncoding('utf8');
    stdin.resume();
    stdin.setRawMode(true);

    let input = '';
    const cleanup = () => {
      if (stdin.isTTY && typeof stdin.setRawMode === 'function') {
        stdin.setRawMode(false);
      }
      stdin.pause();
      stdin.removeListener('data', onData);
    };

    const onData = (char: string) => {
      switch (char) {
        case '\n':
        case '\r':
        case '\u0004': {
          stdout.write('\n');
          cleanup();
          resolve(input);
          return;
        }
        case '\u0003': {
          cleanup();
          stdout.write('\n');
          process.exit(130);
          return;
        }
        case '\u007f': {
          if (input.length > 0) {
            input = input.slice(0, -1);
            stdout.write('\b \b');
          }
          return;
        }
        default: {
          input += char;
        }
      }
    };

    stdin.on('data', onData);
  });
}
