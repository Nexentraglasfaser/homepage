import {isScheduled, type OperationRecord} from './operations-model';
import {overviewStatus} from './operations-overview';
import {matchesOperationSearch} from './operations-search';

export const installerStatuses = ['Alle Status', 'Offen', 'Offen · terminiert', 'Offen · ohne Termin', 'Terminiert', 'Fehlerstelle', 'Abgeschlossen', 'Storniert', 'Klärungsbedarf'] as const;
export type InstallerStatus = typeof installerStatuses[number];

export function matchesInstallerFilters(record: OperationRecord, project: string, filter: InstallerStatus, query: string) {
 if (project && record.project !== project) return false;
 const status = overviewStatus(record);
 let match: boolean;
 switch (filter) {
  case 'Alle Status': match = true; break;
  case 'Terminiert': match = isScheduled(record); break;
  case 'Offen · terminiert': match = status === 'Offen' && isScheduled(record); break;
  case 'Offen · ohne Termin': match = status === 'Offen' && !isScheduled(record); break;
  case 'Abgeschlossen': match = status === 'Fertiggestellt'; break;
  default: match = status === filter;
 }
 return match && matchesOperationSearch(record, query);
}
