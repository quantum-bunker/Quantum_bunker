import { Session } from '../../../shared/contracts/v1/session';

export interface ISessionStore {
  save(session: Session): Promise<void>;
  get(id: string): Promise<Session | null>;
  delete(id: string): Promise<void>;
  touch(id: string): Promise<void>;
  count(): Promise<number>; // Number of sessions currently held
  cleanup(): Promise<Session[]>; // Remove expired sessions
}
