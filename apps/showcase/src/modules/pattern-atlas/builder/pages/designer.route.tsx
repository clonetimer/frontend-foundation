import { Navigate } from 'react-router';

/** Old public route stays available; the integrated studio is the primary editor. */
export function Component() { return <Navigate to="/studio" replace/>; }
