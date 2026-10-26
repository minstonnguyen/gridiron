import type { FranchiseState, Staff } from './types';
import { Rng } from './rng';

// Coordinators, position coaches, trainers and scouts are GENERATED (fictional names) because no public dataset
// lists every NFL staff member reliably. Head coaches are real (nflverse schedules). The UI labels generated staff.
const FIRST = ['Aaron', 'Ben', 'Carl', 'Dale', 'Eli', 'Frank', 'Gil', 'Hank', 'Ira', 'Jack', 'Kurt', 'Lou', 'Marv', 'Ned', 'Owen', 'Pete', 'Quinn', 'Ray', 'Stan', 'Ted', 'Vic', 'Walt', 'Zack',
  'Andre', 'Byron', 'Cedric', 'Darnell', 'Emmett', 'Floyd', 'Grady', 'Hollis', 'Jerome', 'Keon', 'Lamont', 'Marcus', 'Nolan', 'Otis', 'Percy', 'Reggie', 'Silas', 'Terrell', 'Vernon', 'Wade',
  'Alana', 'Brooke', 'Carmen', 'Dana', 'Erin', 'Gina', 'Jen', 'Kara', 'Lena', 'Maya', 'Nina', 'Rosa', 'Tess'];
const LAST = ['Abbott', 'Barlow', 'Calder', 'Dorsey', 'Ellison', 'Fenwick', 'Garrity', 'Halvorsen', 'Ingram', 'Jessup', 'Keane', 'Lockhart', 'Mercer', 'Nygard', 'Oakes', 'Pruitt', 'Quarles',
  'Ridley', 'Sorensen', 'Tolliver', 'Underwood', 'Vance', 'Whitlock', 'Yarbrough', 'Zeller', 'Ashby', 'Brandt', 'Corbin', 'Delacroix', 'Eckert', 'Faulk', 'Grissom', 'Hatcher', 'Iverson',
  'Jolley', 'Kessler', 'Langford', 'McBride', 'Northcutt', 'Ogden', 'Pembrook', 'Rourke', 'Stallworth', 'Thibodeaux', 'Upshaw', 'Voss', 'Winfield', 'Yates', 'Boudreaux', 'Castellano',
  'Draper', 'Espinoza', 'Fairbanks', 'Gallardo', 'Hensley', 'Kowalski', 'Lindqvist', 'Moreau', 'Okafor', 'Petrakis', 'Ramires', 'Sandoval', 'Takahashi', 'Villalobos', 'Whitaker'];

export const STAFF_ATTRS = [
  { key: 'tac', label: 'Tactical Knowledge' }, { key: 'mot', label: 'Motivating' }, { key: 'dvo', label: 'Developing Offense' },
  { key: 'dvd', label: 'Developing Defense' }, { key: 'dis', label: 'Discipline' }, { key: 'jab', label: 'Judging Ability' },
  { key: 'jpo', label: 'Judging Potential' }, { key: 'phy', label: 'Physiotherapy' }, { key: 'adp', label: 'Adaptability' },
];

const ROLES_USER = ['Offensive Coordinator', 'Defensive Coordinator', 'Special Teams Coordinator', 'Quarterbacks Coach', 'Offensive Line Coach',
  'Defensive Line Coach', 'Defensive Backs Coach', 'Head Athletic Trainer', 'Director of Pro Scouting', 'Director of College Scouting',
  'Area Scout (Northeast)', 'Area Scout (Southeast)', 'Area Scout (Midwest)', 'Area Scout (West)', 'Pro Scout'];
const ROLES_AI = ['Offensive Coordinator', 'Defensive Coordinator', 'Director of Pro Scouting', 'Head Athletic Trainer'];

const focus: Record<string, string[]> = {
  'Offensive Coordinator': ['tac', 'dvo'], 'Defensive Coordinator': ['tac', 'dvd'], 'Special Teams Coordinator': ['tac', 'mot'],
  'Quarterbacks Coach': ['dvo'], 'Offensive Line Coach': ['dvo'], 'Defensive Line Coach': ['dvd'], 'Defensive Backs Coach': ['dvd'],
  'Head Athletic Trainer': ['phy'], 'Director of Pro Scouting': ['jab', 'jpo'], 'Director of College Scouting': ['jab', 'jpo'],
  'Head Coach': ['tac', 'mot', 'dis'],
};

export function generateStaff(rng: Rng, state: Pick<FranchiseState, 'teams' | 'userTeam' | 'meta'>): Staff[] {
  const out: Staff[] = [];
  const used = new Set<string>();
  const name = () => {
    for (let i = 0; i < 50; i++) { const n = `${rng.pick(FIRST)} ${rng.pick(LAST)}`; if (!used.has(n)) { used.add(n); return n; } }
    return `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
  };
  const attrs = (role: string) => {
    const a: Record<string, number> = {};
    for (const s of STAFF_ATTRS) a[s.key] = Math.max(1, Math.min(20, Math.round(rng.normal(9, 3))));
    for (const k of focus[role] ?? (role.startsWith('Area Scout') || role === 'Pro Scout' ? ['jab', 'jpo'] : [])) a[k] = Math.max(1, Math.min(20, Math.round(rng.normal(13, 3))));
    return a;
  };
  for (const t of state.teams) {
    const isUser = t.abbr === state.userTeam;
    out.push({ id: `${t.abbr}-hc`, team: t.abbr, role: 'Head Coach', name: isUser ? state.meta.coach : t.head_coach ?? 'Head Coach', real: !isUser && !!t.head_coach, attrs: attrs('Head Coach') });
    for (const role of isUser ? ROLES_USER : ROLES_AI) out.push({ id: `${t.abbr}-${role}`, team: t.abbr, role, name: name(), real: false, attrs: attrs(role) });
  }
  return out;
}

export function staffBy(state: FranchiseState, team: string, role: string) {
  return state.staff.find((s) => s.team === team && s.role === role);
}
