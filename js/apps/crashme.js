// CRASHME.EXE: a program that crashes the moment it starts.

import { crash } from '../dialogs.js';

export default { id: 'crashme', title: 'CRASHME', icon: 'i-exe', open: () => { crash('CRASHME.EXE'); return null; } };
