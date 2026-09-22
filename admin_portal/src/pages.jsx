// Compatibility barrel for Admin Portal page exports.
// Feature implementations live in dedicated modules.

export {
  Badge,
  Table,
  PageHeader,
  StatCard,
} from './components/AdminUi.jsx';

export {
  CompaniesPage,
  PersonalUsersPage,
  CompanyDetailPage,
} from './features/users/UserManagementPages.jsx';

export {
  MarketplaceBusinessesPage,
} from './features/marketplace/MarketplaceBusinessesPage.jsx';

export {
  CommunityModerationPage,
} from './features/community/CommunityModerationPage.jsx';

export {
  USSDTemplatesPage,
  FlowsPage,
} from './features/ussd/UssdAdminPages.jsx';

export {
  ShiftsPage,
} from './features/operations/ShiftsPage.jsx';

export {
  AuditLogsPage,
} from './features/audit/AuditLogsPage.jsx';

export {
  CommissionsPage,
} from './features/commissions/CommissionsPage.jsx';
