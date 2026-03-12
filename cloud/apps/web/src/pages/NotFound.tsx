import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-medium uppercase tracking-wide text-gray-500">404</p>
      <h1 className="mt-2 text-3xl font-serif font-medium text-[#1A1A1A]">Page not found</h1>
      <p className="mt-3 max-w-md text-sm text-gray-500">
        The page you requested does not exist or is no longer available.
      </p>
      <Link
        to="/"
        className="mt-6 inline-flex items-center rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
      >
        Go to Dashboard
      </Link>
    </div>
  );
}
