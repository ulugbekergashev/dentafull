import { createContext, useContext } from 'react';
import { PermChecker, makePermChecker } from '../utils/permissions';

// Joriy xodimning ruxsatlari. App uni klinika sozlamasidan bir marta hisoblaydi,
// sahifalar esa `usePerms()` bilan o'qiydi — har bir sahifaga prop uzatmasdan.
// Provayder yo'q joyda (masalan landing) hamma narsa ochiq: u yerda xodim yo'q.
const PermissionsContext = createContext<PermChecker>(makePermChecker('CLINIC_ADMIN', null));

export const PermissionsProvider = PermissionsContext.Provider;
export const usePerms = (): PermChecker => useContext(PermissionsContext);
