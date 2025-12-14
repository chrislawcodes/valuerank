import { AlertCircle } from 'lucide-react';
import { Button } from './Button';

type ErrorMessageProps = {
  message: string;
  onRetry?: () => void;
};

export function ErrorMessage({ message, onRetry }: ErrorMessageProps) {
  return (
    <div className="rounded-lg bg-red-50 border border-red-200 p-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm text-red-800">{message}</p>
          {onRetry && (
            <Button
              type="button"
              onClick={onRetry}
              variant="ghost"
              size="sm"
              className="mt-2 p-0 h-auto text-sm font-medium text-red-600 hover:text-red-500 hover:bg-transparent"
            >
              Try again
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
