(function () {
  const SEARCH_DEBOUNCE_MS = 120;

  const PAGE_FLOW = [
    'home',
    'current-orders',
    'orders-review',
    'operations-orders',
    'maintenance-orders',
    'create-order',
    'stocktaking',
    'b2b',
    'tasks',
    'expenses',
    'expenses-users',
    'account',
  ];

  const MODULES = [
    {
      id: 'operating-rules',
      type: 'shared',
      alwaysVisible: true,
      icon: 'shield',
      title: 'Operating rules',
      route: 'Shared across the system',
      eyebrow: 'Global SOP',
      overview:
        'This app reads from Notion and mirrors the daily workflow of the Operations department. Use the correct page for the correct step so the order lifecycle, evidence, and balances stay accurate.',
      purpose:
        'Keep one operating standard across all visible modules and avoid duplicate actions or stale data.',
      whenToUse:
        'Use these rules before you start any update, approval, shipment, receipt, maintenance action, or expense submission.',
      result:
        'Consistent data in Notion, clean order history, and fewer follow-up corrections.',
      steps: [
        {
          title: 'Start from the right page',
          body:
            'Each page owns a specific stage. Track in Current Orders, approve in Orders Review, execute in Operations or Maintenance Orders, and log money in Expenses.',
        },
        {
          title: 'Treat Notion as the source of truth',
          body:
            'The app is connected to Notion. When records are edited directly in Notion, use Hard Refresh so the app fetches the latest version instead of older cached responses.',
        },
        {
          title: 'Close actions with evidence',
          body:
            'Receipt numbers, screenshots, and signed reports are not optional decoration. They are the proof that allows a workflow to move safely to the next stage.',
        },
        {
          title: 'Correct instead of duplicating',
          body:
            'When an order already exists and only needs a fix, use the edit workflow instead of creating a second order for the same case.',
        },
      ],
      rules: [
        'Only the pages allowed for your account should be used for action-taking. The sidebar and this SOP both follow your permission scope.',
        'Use Hard Refresh after important direct changes in Notion or when the page still shows old values.',
        'Do not close an order, maintenance task, or expense without the required proof for that specific step.',
        'Keep notes, reasons, issue descriptions, and quantities clear enough that another team member can continue the work without guessing.',
      ],
      controls: ['Role-based access', 'Notion sync', 'Hard Refresh', 'Evidence-first workflow'],
      keywords: ['cache', 'notion', 'permissions', 'rules', 'evidence', 'standard operating procedure'],
    },
    {
      id: 'shared-controls',
      type: 'shared',
      alwaysVisible: true,
      icon: 'sliders',
      title: 'Shared controls',
      route: 'Visible on every main page',
      eyebrow: 'Daily navigation',
      overview:
        'These controls appear across the system and help the team move faster without opening extra pages.',
      purpose:
        'Give every user one consistent way to search, review alerts, refresh cached data, and manage their account.',
      whenToUse:
        'Use these controls whenever you need to jump between pages, check new activity, or sync fresh data from Notion.',
      result:
        'Faster navigation and fewer cases of working on stale information.',
      steps: [
        {
          title: 'Quick Search',
          body:
            'Use the search button in the top-right area to open the quick search box and jump faster inside the system.',
        },
        {
          title: 'Notifications',
          body:
            'Open the bell icon to review your latest notifications before starting the next action or closing a task.',
        },
        {
          title: 'Profile menu',
          body:
            'Use the avatar menu to open Account, this How it works page, Hard Refresh, or Log out.',
        },
        {
          title: 'Hard Refresh',
          body:
            'Hard Refresh clears the app caches and reloads the current page fresh so updated Notion data appears faster.',
        },
      ],
      rules: [
        'Hard Refresh is the correct action after direct Notion edits, not repeated manual reloading and guessing.',
        'Check notifications before making the next move when your role depends on incoming approvals or updates.',
        'Use Account and How it works from the profile menu so the rest of the navigation remains focused on workflow pages.',
      ],
      controls: ['Quick Search', 'Notifications', 'Profile menu', 'Hard Refresh'],
      keywords: ['search', 'bell', 'avatar', 'log out', 'refresh', 'common controls'],
    },
    {
      id: 'home',
      type: 'page',
      alwaysVisible: true,
      icon: 'home',
      title: 'Home',
      route: '/home',
      eyebrow: 'Overview',
      overview:
        'Home is the starting point of the operations workflow. It shows the pages, KPIs, quick actions, and summaries that match the current user access.',
      purpose:
        'Give a fast snapshot of workload, recent activity, and the modules you should open next.',
      whenToUse:
        'Open Home at the beginning of the day, after a refresh, or when you need a quick decision on where to continue working.',
      result:
        'A clear picture of priorities without opening every page one by one.',
      steps: [
        {
          title: 'Check the KPI cards',
          body:
            'Read the overview cards for tasks, current orders, operations orders, stocktaking, and expenses that are available for your role.',
        },
        {
          title: 'Review the recent lists',
          body:
            'Use the Next tasks and Recent orders areas to identify the next item that needs attention.',
        },
        {
          title: 'Use Quick actions',
          body:
            'Open the correct workflow directly from the quick-action shortcuts instead of navigating page by page.',
        },
        {
          title: 'Confirm your scope',
          body:
            'Use the scope card to see your department, position, and the pages currently enabled for your account.',
        },
      ],
      rules: [
        'Home reflects your access scope, so different team members will not see the same shortcuts or cards.',
        'Use Home for decision-making and navigation; detailed updates still belong in the operational page itself.',
      ],
      controls: ['Overview KPIs', 'Recent tasks', 'Recent orders', 'Quick actions', 'Your scope'],
      keywords: ['dashboard', 'overview', 'quick actions', 'scope', 'kpi'],
    },
    {
      id: 'current-orders',
      type: 'page',
      icon: 'list',
      access: ['Current Orders', '/orders'],
      title: 'Current Orders',
      route: '/orders',
      eyebrow: 'Live tracking',
      overview:
        'Use this page to track every active order, open the full order details, export the record, and understand where the order currently sits in the workflow.',
      purpose:
        'Follow the live order pipeline and reopen an existing order safely when a controlled correction is needed.',
      whenToUse:
        'Use it when you need to check an order status, review the full item list, export a copy, or send an approved order back into edit mode.',
      result:
        'One clean live view of the order and its current position in the execution cycle.',
      steps: [
        {
          title: 'Open the order card',
          body:
            'Review the order number, date, reason, item count, and estimated total before opening the full details.',
        },
        {
          title: 'Read the tracker',
          body:
            'The order tracker follows the main lifecycle: Order Placed → Under Supervision → In progress → Shipped → Arrived.',
        },
        {
          title: 'Inspect the item lines',
          body:
            'Open the order modal to review each product line, quantity, and current line-level status without leaving the page.',
        },
        {
          title: 'Export when needed',
          body:
            'Use PDF or Excel export when the order must be shared, printed, or archived outside the live screen.',
        },
        {
          title: 'Edit only through the protected flow',
          body:
            'When a real correction is required, use Edit. The system protects this action with the admin password and reopens the same order in the create-order flow.',
        },
      ],
      rules: [
        'Orders are grouped primarily by Order - ID so all lines that belong to one order stay together.',
        'Edit is an admin-protected action and should be used to correct an existing order, not to duplicate it.',
        'Current Orders is a tracking page; operational receiving, delivery proof, and maintenance closure belong to the execution pages.',
      ],
      controls: ['Open order details', 'Tracker view', 'Export PDF / Excel', 'Edit with admin password'],
      keywords: ['tracking', 'order stage', 'order details', 'export', 'edit order'],
    },
    {
      id: 'orders-review',
      type: 'page',
      icon: 'award',
      access: ['Orders Review', '/orders/sv-orders', 'S.V Schools Orders'],
      title: 'Orders Review',
      route: '/orders/sv-orders',
      eyebrow: 'Supervisor approval',
      overview:
        'Orders Review is the supervisor workspace for checking requested quantities and moving orders to Approved or Rejected.',
      purpose:
        'Apply supervisor control before the order moves deeper into execution.',
      whenToUse:
        'Use it whenever a new order needs review, quantity adjustment, approval, or rejection.',
      result:
        'A reviewed order with a clear approval status and any supervisor quantity correction stored safely.',
      steps: [
        {
          title: 'Start from Not Started',
          body:
            'Open the Not Started tab to review new order groups that still need a supervisor decision.',
        },
        {
          title: 'Review the requested quantities',
          body:
            'Check the reason, products, and requested quantities before deciding whether the order should move forward as-is.',
        },
        {
          title: 'Edit the quantity only when needed',
          body:
            'Adjust the quantity inline if the order should proceed with a supervisor-edited amount rather than the original request.',
        },
        {
          title: 'Approve or Reject',
          body:
            'Move the group to Approved when it is ready to continue, or Reject when it should stop and return for correction.',
        },
        {
          title: 'Monitor the decision tabs',
          body:
            'Use the Approved and Rejected tabs to follow the final decision and avoid re-reviewing the same group twice.',
        },
      ],
      rules: [
        'Each reviewer only sees the orders created by the team members linked to that reviewer in the Team Members database relation for S.V Schools.',
        'Supervisor quantity edits do not erase the original requested quantity. The edited value is stored separately so the request remains auditable.',
        'Approve only after the quantity and reason are operationally correct enough for execution.',
      ],
      controls: ['Not Started / Approved / Rejected tabs', 'Inline quantity edit', 'Approve', 'Reject'],
      keywords: ['supervisor', 'approval', 'rejected', 'edited quantity', 'review'],
    },
    {
      id: 'operations-orders',
      type: 'page',
      icon: 'users',
      access: ['Requested Orders', 'Schools Requested Orders', '/orders/requested'],
      title: 'Operations Orders',
      route: '/orders/requested',
      eyebrow: 'Execution workspace',
      overview:
        'Operations Orders is the main execution page for product movement after the order reaches the operations workflow.',
      purpose:
        'Move live orders through shipping, receiving, remaining quantities, proof upload, and any follow-up action after delivery.',
      whenToUse:
        'Use it when a reviewed order is being prepared, shipped, partially received, fully received, delivered, or repeated as a follow-up order.',
      result:
        'A controlled execution record with accurate quantities, proof files, and a clear delivered status.',
      steps: [
        {
          title: 'Start in Not Started',
          body:
            'Use the Not Started tab for orders that have not reached the shipped stage yet and still need the first execution action.',
        },
        {
          title: 'Use the correct receiving path by order type',
          body:
            'Request Products asks for one or more store receipt numbers when operations receive the items. Withdraw Products can be received without that first receipt step. Maintenance requests switch the action to Request Technical Visit.',
        },
        {
          title: 'Manage partial shipments in Remaining',
          body:
            'When a shipment is incomplete, use the Remaining tab to confirm the quantity still missing so Quantity Remaining stays accurate.',
        },
        {
          title: 'Confirm full receipt',
          body:
            'When the order is fully received after shipping, it moves to the Received tab for the final delivery action.',
        },
        {
          title: 'Close with signed proof',
          body:
            'Upload the required signed report to mark the order delivered or arrived and close the execution stage correctly.',
        },
        {
          title: 'Create the next movement when needed',
          body:
            'Delivered product orders can create a follow-up Withdrawal, and delivered withdrawal orders can create a follow-up Delivery directly from the page.',
        },
      ],
      rules: [
        'Not Started = before shipping. Remaining = shipped but not fully received. Received = fully received after shipping. Delivered = closed after the signed proof is uploaded.',
        'The quantity editor in Remaining is for keeping received-versus-remaining quantities accurate; do not use it as a casual note field.',
        'Use the receipt workflow that matches the order type so the evidence appears at the correct stage.',
        'Close only when the signed proof is uploaded successfully.',
      ],
      controls: ['Not Started / Remaining / Received / Delivered tabs', 'Receipt modal', 'Quantity editor', 'Signed report upload', 'Create Withdrawal / Create Delivery'],
      keywords: ['operations orders', 'remaining', 'received by operations', 'mark shipped', 'receipt number', 'signed report'],
    },
    {
      id: 'maintenance-orders',
      type: 'page',
      icon: 'tool',
      access: ['Maintenance Orders', '/orders/maintenance-orders'],
      title: 'Maintenance Orders',
      route: '/orders/maintenance-orders',
      eyebrow: 'Technical follow-up',
      overview:
        'Maintenance Orders manages service and repair work after a maintenance request has entered the technical workflow.',
      purpose:
        'Track technical visits, capture the maintenance log, and close the maintenance case with signed proof.',
      whenToUse:
        'Use it when the request is a maintenance order and the case needs technical handling rather than normal product movement.',
      result:
        'A complete maintenance record with issue details, repair notes, spare parts, and signed closure evidence.',
      steps: [
        {
          title: 'Open the active maintenance case',
          body:
            'Use the Received tab for maintenance requests that are already in the technical workflow and still need action.',
        },
        {
          title: 'Log the maintenance work',
          body:
            'Complete the maintenance form with Resolution Method, Actual Issue Description, Repair Action, and Spare Parts Replaced.',
        },
        {
          title: 'Review the technical outcome',
          body:
            'Make sure the description explains what was actually found and what was fixed so the service history stays useful later.',
        },
        {
          title: 'Upload the signed maintenance report',
          body:
            'Use the maintenance proof upload to attach the signed report before closing the case as delivered.',
        },
        {
          title: 'Use Delivered as the closed archive',
          body:
            'After the signed report is accepted, the delivered state becomes the clean finished record for that maintenance order.',
        },
      ],
      rules: [
        'Maintenance closure requires signed report images. The case should not be marked delivered without them.',
        'Use factual technical language in Actual Issue Description and Repair Action so later follow-up remains clear.',
        'This page is for maintenance/service orders only; standard product receipts belong to Operations Orders.',
      ],
      controls: ['Received / Delivered tabs', 'Log Maintenance', 'Signed maintenance report upload'],
      keywords: ['maintenance', 'technical visit', 'repair action', 'spare parts', 'signed maintenance report'],
    },
    {
      id: 'create-order',
      type: 'page',
      icon: 'shopping-cart',
      access: ['Create New Order', '/orders/new', '/orders/new/products'],
      title: 'Create New Order',
      route: '/orders/new/products',
      eyebrow: 'Order creation',
      overview:
        'Create New Order is the controlled entry point for new operational requests and protected order edits.',
      purpose:
        'Create product requests, product withdrawals, and maintenance requests with the correct fields, password confirmation, and order grouping.',
      whenToUse:
        'Use it to create a fresh order, continue a saved draft, or edit an existing order through the protected edit flow.',
      result:
        'A clean order group in Notion with the next available Order - ID and the correct order type data.',
      steps: [
        {
          title: 'Choose the order type first',
          body:
            'The page supports Request Products, Withdraw Products, and Request Maintenance. The available fields change based on the type you choose.',
        },
        {
          title: 'Build the cart correctly',
          body:
            'Search components, add them to the cart, and review the lines before checkout. Draft data is saved so work is not lost between visits.',
        },
        {
          title: 'Use the required fields for the selected type',
          body:
            'Request Products and Withdraw Products require a global reason and password at checkout. Request Maintenance requires a school and issue description, and its reason is derived automatically from the issue.',
        },
        {
          title: 'Respect the maintenance limitation',
          body:
            'Maintenance requests allow one machine only in the cart. Edit or remove the current item before adding another one.',
        },
        {
          title: 'Submit through the protected checkout',
          body:
            'Checkout requires the user password and the system allocates the next Order - ID by checking the highest current number in Notion before creating the new order group.',
        },
        {
          title: 'Track it after submission',
          body:
            'Once submitted, follow the new group in Current Orders and the later execution pages rather than creating a second copy.',
        },
      ],
      rules: [
        'Password is required at checkout for product requests and withdrawals.',
        'Request Maintenance requires a school, an issue description, and only one machine in the cart.',
        'Use edit mode for corrections to an existing order instead of submitting a duplicate order.',
        'The app keeps draft data so users can continue safely, but drafts should not replace final review before checkout.',
      ],
      controls: ['Order type selector', 'Component search', 'Draft autosave', 'Password checkout', 'Protected edit mode'],
      keywords: ['new order', 'cart', 'draft', 'maintenance request', 'withdraw products', 'request products'],
    },
    {
      id: 'stocktaking',
      type: 'page',
      icon: 'archive',
      access: ['Stocktaking', '/stocktaking'],
      title: 'Stocktaking',
      route: '/stocktaking',
      eyebrow: 'Live stock reference',
      overview:
        'Stocktaking shows the current in-stock quantities grouped by tag and searchable by component name or category.',
      purpose:
        'Give operations a quick reference for what is currently available before raising or reviewing requests.',
      whenToUse:
        'Use it when you need to confirm stock availability, search for a component, or export the current stock snapshot.',
      result:
        'A filtered live stock view focused on items that currently have positive in-stock values.',
      steps: [
        {
          title: 'Search by component or tag',
          body:
            'Use the search tools to narrow the list faster instead of scrolling through the full stock dataset.',
        },
        {
          title: 'Review grouped stock',
          body:
            'Stock is grouped by tag so related components stay together and are easier to compare.',
        },
        {
          title: 'Read live positive stock only',
          body:
            'The page focuses on items with positive In Stock quantities so the view stays practical for operations decisions.',
        },
        {
          title: 'Export when a snapshot is needed',
          body:
            'Use PDF or Excel export when the current stock state needs to be shared outside the screen.',
        },
      ],
      rules: [
        'Stocktaking is a reference page. Use Create New Order and the execution pages for actual movement, not this page.',
        'Items with zero stock are not the focus of this screen, so confirm shortages through the operational workflow when needed.',
      ],
      controls: ['Search', 'Grouped stock list', 'PDF export', 'Excel export'],
      keywords: ['stock', 'in stock', 'component search', 'inventory reference'],
    },
    {
      id: 'b2b',
      type: 'page',
      icon: 'folder',
      access: ['B2B', '/b2b'],
      title: 'B2B',
      route: '/b2b',
      eyebrow: 'School folders & inventory',
      overview:
        'B2B is the school browser for stock visibility and physical inventory work at the school level.',
      purpose:
        'Open school records, review their stock, and run controlled inventory sessions with admin protection.',
      whenToUse:
        'Use it when you need to find a school, inspect its stock profile, export its stock file, or run an inventory cycle.',
      result:
        'A school-specific stock view and a controlled inventory record with downloadable output.',
      steps: [
        {
          title: 'Search for the correct school',
          body:
            'Use the school browser to search by school name, governorate, education system, or program type.',
        },
        {
          title: 'Open the school detail page',
          body:
            'Review school information and the stock list grouped by tag before taking any inventory action.',
        },
        {
          title: 'Export the current stock when needed',
          body:
            'Use the school-level PDF or Excel export when the stock list needs to be reviewed or shared externally.',
        },
        {
          title: 'Start inventory only when the count begins',
          body:
            'Make inventory is protected by the admin password. Start it when the physical count really starts so today\'s inventory columns are created intentionally.',
        },
        {
          title: 'Fill Inventory and Defected accurately',
          body:
            'During the inventory cycle, update the Inventory and Defected values directly in the school stock grid.',
        },
        {
          title: 'Finish inventory and download the result',
          body:
            'Finish inventory is also admin-protected and closes the session by exporting the output file. After finishing, the special inventory columns are hidden again.',
        },
      ],
      rules: [
        'Inventory mode should only be opened during a real count and closed in the same cycle.',
        'Admin password is required to start and finish inventory mode.',
        'Use the school detail page for school-level stock and defect tracking; the main B2B page is the browser and entry point.',
      ],
      controls: ['School search', 'School details', 'Stock export', 'Make inventory', 'Finish inventory'],
      keywords: ['school folders', 'inventory', 'defected', 'school stock', 'b2b'],
    },
    {
      id: 'tasks',
      type: 'page',
      icon: 'check-square',
      access: ['Tasks', '/tasks'],
      title: 'Tasks',
      route: '/tasks',
      eyebrow: 'Execution follow-up',
      overview:
        'Tasks manages personal work and delegated follow-up with statuses, due dates, priority, media, and checklist points.',
      purpose:
        'Turn operational work into visible assignments with accountable ownership and clear progress tracking.',
      whenToUse:
        'Use it to create tasks, assign work, update progress, or review delegated execution.',
      result:
        'A structured task record with owner, status, due date, and completion checkpoints.',
      steps: [
        {
          title: 'Choose your task scope',
          body:
            'Switch between My tasks and Delegated tasks depending on whether you are executing work or following up on work assigned to others.',
        },
        {
          title: 'Filter by status',
          body:
            'Use the status tabs to move between All, Not started, In progress, Paused, Done, and Canceled.',
        },
        {
          title: 'Create the task properly',
          body:
            'When creating a task, set the subject, assignee, delivery date, priority level, attachments, and checklist points if the work has multiple checkpoints.',
        },
        {
          title: 'Track execution in the detail view',
          body:
            'Open the task detail to review the latest checkpoints, due-date context, and the current status before deciding the next action.',
        },
        {
          title: 'Use Delegated tasks for accountability',
          body:
            'Delegated view is where managers and leads should follow assigned work without mixing it with their own action list.',
        },
      ],
      rules: [
        'Create a task with a clear assignee and delivery date so ownership is never ambiguous.',
        'Use checklist points for multi-step work instead of hiding several steps in one short task title.',
        'Status should reflect the real working state. Do not leave finished work in active tabs.',
      ],
      controls: ['My tasks / Delegated tasks', 'Status tabs', 'Create task', 'Priority', 'Checklist & attachments'],
      keywords: ['task', 'delegated', 'due date', 'priority', 'checklist', 'paused', 'done'],
    },
    {
      id: 'expenses',
      type: 'page',
      icon: 'dollar-sign',
      access: ['Expenses', '/expenses', 'My Expenses'],
      title: 'Expenses',
      route: '/expenses',
      eyebrow: 'Personal money log',
      overview:
        'Expenses is the personal finance page for recording money in, money out, proof files, and balance settlement for operational work.',
      purpose:
        'Keep every operational spending or received amount documented with the right reason and proof.',
      whenToUse:
        'Use it when you receive money, spend money, attach proof to a movement, or settle your balance with the company.',
      result:
        'A clear money trail linked to the user with evidence and a visible running balance.',
      steps: [
        {
          title: 'Use Cash In for received amounts',
          body:
            'Select the correct funds type, fill date and amount, and always record who paid the amount into your balance.',
        },
        {
          title: 'Attach the right proof for Cash In',
          body:
            'Cash payment requires a receipt number, while online transfer requires a screenshot upload before submission.',
        },
        {
          title: 'Use Cash Out for spending',
          body:
            'Link the spending to an order when possible, or use another reason when the expense is not tied to a formal order.',
        },
        {
          title: 'Handle special funds types correctly',
          body:
            'Own car uses kilometer-based logic and requires a Google Maps screenshot. Other funds types may also require screenshots before submission.',
        },
        {
          title: 'Submit and settle cleanly',
          body:
            'Use Settled my account with a receipt number to close the running balance and separate recent transactions from older settled history.',
        },
      ],
      rules: [
        'Use the proof type required by the selected funds type. Missing proof is a workflow blocker, not a minor warning.',
        'Cash In requires payment-by details. Cash payment requires a receipt number. Transfer requires screenshots.',
        'Own car requires a Google Maps screenshot and uses kilometer input rather than a normal cash amount.',
        'Settled my account needs a receipt number and is the clean closing action for your current balance.',
      ],
      controls: ['All Expenses', '+ CASH IN', '- CASH OUT', 'Settled my account', 'Proof uploads'],
      keywords: ['cash in', 'cash out', 'settlement', 'receipt', 'transfer screenshot', 'own car'],
    },
    {
      id: 'expenses-users',
      type: 'page',
      icon: 'credit-card',
      access: ['Expenses Users', '/expenses/users', 'Expenses By User'],
      title: 'Expenses Users',
      route: '/expenses/users',
      eyebrow: 'Team audit view',
      overview:
        'Expenses Users is the management view for reviewing balances and history across team members rather than entering your own transactions.',
      purpose:
        'Monitor user balances, last settlement dates, and supporting evidence from a leadership or audit perspective.',
      whenToUse:
        'Use it when you need to review a specific user account, compare balances, or audit the supporting records by person.',
      result:
        'A per-user expense history split into recent and past records around the latest settlement point.',
      steps: [
        {
          title: 'Start from the user tiles',
          body:
            'Review each user card to see item count, current balance, and the latest settlement date before opening the details.',
        },
        {
          title: 'Open the user history',
          body:
            'Select a user to inspect their expense lines, screenshots, and balance behavior in more detail.',
        },
        {
          title: 'Use filters and sort',
          body:
            'Narrow the review by date and use the available sort controls to focus the audit on the right period.',
        },
        {
          title: 'Read recent versus past correctly',
          body:
            'The page separates items around the user\'s latest settlement, so recent operational balance is easy to distinguish from older history.',
        },
      ],
      rules: [
        'This page is for review and follow-up, not for entering personal expense movements.',
        'Always interpret the user history together with the latest settlement date so recent balance is not confused with older settled data.',
      ],
      controls: ['User tiles', 'Balance review', 'Date filters', 'History inspection'],
      keywords: ['team expenses', 'balance review', 'audit', 'last settled', 'users'],
    },
    {
      id: 'account',
      type: 'page',
      alwaysVisible: true,
      icon: 'settings',
      title: 'Account',
      route: '/account',
      eyebrow: 'Profile & security',
      overview:
        'Account keeps the user profile, photo, contact details, and password aligned with the real operating identity inside the system.',
      purpose:
        'Maintain accurate user information and protect access with correct password management.',
      whenToUse:
        'Use it when your photo, phone, email, department, position, or password needs an update.',
      result:
        'A current profile that matches the user and a safer account for daily operations work.',
      steps: [
        {
          title: 'Review the visible profile data',
          body:
            'Check the displayed name, department, position, phone, and email so the account reflects the real user identity.',
        },
        {
          title: 'Update the profile photo carefully',
          body:
            'Use the account workflow to upload a current profile picture when the displayed image needs correction.',
        },
        {
          title: 'Keep contact details current',
          body:
            'Update phone and email so follow-up, access recovery, and team communication stay reliable.',
        },
        {
          title: 'Change password through verification',
          body:
            'Sensitive updates require the current password, so have it ready before starting profile or security changes.',
        },
      ],
      rules: [
        'Sensitive account changes are protected by current-password verification.',
        'Keep your visible profile data current so the rest of the system shows the correct identity and contact context.',
      ],
      controls: ['Profile picture', 'Phone / Email', 'Department / Position', 'Password update'],
      keywords: ['profile', 'account', 'password', 'photo', 'contact details'],
    },
  ];

  function normalize(value) {
    return String(value || '').trim().toLowerCase();
  }

  function normalizePath(value) {
    return normalize(value).replace(/\/+$/, '');
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[char]));
  }

  function buildAllowedSet(allowedPages) {
    const set = new Set();
    (allowedPages || []).forEach((value) => {
      const key = normalize(value);
      const path = normalizePath(value);
      if (key) set.add(key);
      if (path) {
        set.add(path);
        if (!path.startsWith('/')) set.add('/' + path);
        if (path.startsWith('/')) set.add(path.slice(1));
      }
    });
    return set;
  }

  function moduleVisible(module, allowedSet) {
    if (module.alwaysVisible) return true;
    const aliases = Array.isArray(module.access) ? module.access : [];
    return aliases.some((alias) => {
      const key = normalize(alias);
      const path = normalizePath(alias);
      return allowedSet.has(key) || allowedSet.has(path) || (path && allowedSet.has('/' + path));
    });
  }

  function moduleOrderIndex(id) {
    const idx = PAGE_FLOW.indexOf(id);
    return idx === -1 ? PAGE_FLOW.length + 100 : idx;
  }

  function collectMappedTokens(module) {
    return new Set(
      (module.access || []).map((token) => normalizePath(token)).filter(Boolean)
    );
  }

  function toDisplayLabel(raw) {
    const value = String(raw || '').trim();
    if (!value) return 'Extra module';
    if (value.startsWith('/')) {
      const slug = value.replace(/^\/+/, '').replace(/\/+/g, ' ').trim();
      return slug ? slug.replace(/\b\w/g, (m) => m.toUpperCase()) : 'Extra module';
    }
    return value;
  }

  function createFallbackModule(rawLabel) {
    const title = toDisplayLabel(rawLabel);
    const clean = normalizePath(rawLabel) || normalize(title) || 'extra-module';
    const safeId = 'extra-' + clean.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return {
      id: safeId || 'extra-module',
      type: 'page',
      icon: 'layers',
      title,
      route: String(rawLabel || 'Assigned to your account'),
      eyebrow: 'Additional access',
      overview:
        'This module is enabled for your account. A detailed Operations SOP has not been authored for it inside the current guide yet, so use the live page carefully and follow the shared operating rules.',
      purpose:
        'Acknowledge that the page exists in your permission scope and keep users inside the correct access boundary.',
      whenToUse:
        'Use this page only when your role requires it and after checking the shared controls and operating rules above.',
      result:
        'The user stays aware of the page scope even before a detailed SOP is added.',
      steps: [
        {
          title: 'Open the page from your allowed navigation',
          body:
            'Enter the page through the sidebar or the route already enabled for your account so you stay within the supported workflow.',
        },
        {
          title: 'Read the visible actions first',
          body:
            'Review the page header, tabs, and action buttons before making changes so you understand which step the page owns.',
        },
        {
          title: 'Apply the shared operating rules',
          body:
            'Use proof where required, avoid duplicate data entry, and refresh after direct Notion edits if the page looks stale.',
        },
      ],
      rules: [
        'Only use the actions that belong to your role and current permission scope.',
        'Escalate to the operations lead before changing a workflow you are not fully sure about.',
      ],
      controls: ['Permission-based access'],
      keywords: ['extra module', 'permission', title],
    };
  }

  function getVisibleModules(account) {
    const allowedPages = Array.isArray(account?.allowedPages) ? account.allowedPages : [];
    const allowedSet = buildAllowedSet(allowedPages);
    const visibleDetailed = MODULES.filter((module) => moduleVisible(module, allowedSet));

    const mappedTokens = new Set();
    visibleDetailed.forEach((module) => {
      collectMappedTokens(module).forEach((token) => mappedTokens.add(token));
    });

    const fallbackModules = [];
    allowedPages.forEach((label) => {
      const token = normalizePath(label);
      if (!token || mappedTokens.has(token)) return;
      const display = toDisplayLabel(label);
      if (!display || normalize(display) === 'home' || normalize(display) === 'account') return;
      fallbackModules.push(createFallbackModule(label));
      mappedTokens.add(token);
    });

    return [...visibleDetailed, ...fallbackModules].sort((a, b) => {
      const typeRankA = a.type === 'shared' ? -1 : 0;
      const typeRankB = b.type === 'shared' ? -1 : 0;
      if (typeRankA !== typeRankB) return typeRankA - typeRankB;
      const orderDiff = moduleOrderIndex(a.id) - moduleOrderIndex(b.id);
      if (orderDiff !== 0) return orderDiff;
      return String(a.title || '').localeCompare(String(b.title || ''));
    });
  }

  async function loadAccount() {
    const response = await fetch('/api/account', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error('Failed to load account information.');
    }
    return response.json();
  }

  function buildVisibleFlow(modules) {
    return modules
      .filter((module) => module.type === 'page')
      .sort((a, b) => moduleOrderIndex(a.id) - moduleOrderIndex(b.id))
      .map((module) => module.title);
  }

  function renderHero(account, modules) {
    const visiblePages = modules.filter((module) => module.type === 'page');
    const sharedCount = modules.filter((module) => module.type === 'shared').length;
    const flow = buildVisibleFlow(visiblePages).slice(0, 8);
    const name = String(account?.name || account?.username || 'Operations user').trim() || 'Operations user';
    const position = String(account?.position || '').trim();
    const department = String(account?.department || '').trim();
    const scopeLabel = [position, department].filter(Boolean).join(' • ') || 'Operations manual';

    return `
      <section class="card sop-hero-card">
        <div class="sop-hero-grid">
          <div class="sop-hero-copy">
            <span class="sop-eyebrow">Operations S.O.P</span>
            <h2 class="sop-hero-title">Role-based guide for every page in your scope.</h2>
            <p class="sop-hero-text">
              This page shows only the procedures that match your current access. It is designed to help ${escapeHtml(name)} work faster,
              move each action in the right place, and keep the Operations workflow aligned with Notion.
            </p>
            <div class="sop-hero-meta">
              <span class="sop-meta-pill"><i data-feather="user"></i>${escapeHtml(name)}</span>
              <span class="sop-meta-pill"><i data-feather="briefcase"></i>${escapeHtml(scopeLabel)}</span>
            </div>
            <div class="sop-flow-wrap">
              <div class="sop-flow-label">Visible workflow in your account</div>
              <div class="sop-flow-chips">
                ${flow.length ? flow.map((label) => `<span class="sop-flow-chip">${escapeHtml(label)}</span>`).join('') : '<span class="sop-flow-chip">Shared modules only</span>'}
              </div>
            </div>
          </div>

          <div class="sop-hero-stats">
            <div class="sop-stat-card">
              <div class="sop-stat-label">Visible pages</div>
              <div class="sop-stat-value">${visiblePages.length}</div>
              <div class="sop-stat-note">Filtered by your allowed access</div>
            </div>
            <div class="sop-stat-card">
              <div class="sop-stat-label">Shared guidance</div>
              <div class="sop-stat-value">${sharedCount}</div>
              <div class="sop-stat-note">Rules and controls available to every user</div>
            </div>
            <div class="sop-stat-card">
              <div class="sop-stat-label">Source of truth</div>
              <div class="sop-stat-value">Notion</div>
              <div class="sop-stat-note">Hard Refresh pulls fresh data after direct edits</div>
            </div>
            <div class="sop-stat-card sop-stat-card--accent">
              <div class="sop-stat-label">Use this page for</div>
              <div class="sop-stat-value sop-stat-value--sm">Standardized work</div>
              <div class="sop-stat-note">Purpose, steps, rules, and required controls</div>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function renderToolbar(modules) {
    const navItems = modules.map((module) => `
      <button class="sop-nav-chip" type="button" data-target="${escapeHtml(module.id)}">
        <i data-feather="${escapeHtml(module.icon || 'circle')}"></i>
        <span>${escapeHtml(module.title)}</span>
      </button>
    `).join('');

    return `
      <section class="card sop-toolbar" aria-label="Guide tools">
        <div class="sop-toolbar-head">
          <div>
            <div class="sop-toolbar-title">Guide tools</div>
            <div class="sop-toolbar-sub">Search any page, rule, button, or workflow keyword inside your visible SOP.</div>
          </div>
          <div class="sop-toolbar-count" id="sopVisibleCount">${modules.length} sections</div>
        </div>
        <div class="sop-search-wrap">
          <i data-feather="search"></i>
          <input id="sopSearchInput" class="sop-search-input" type="search" placeholder="Search pages, actions, rules, receipts, reports, tasks, expenses..." aria-label="Search this SOP" />
        </div>
        <div class="sop-nav-scroll" id="sopNav">
          ${navItems}
        </div>
      </section>
    `;
  }

  function renderSummaryCards(module) {
    return `
      <div class="sop-summary-grid">
        <article class="sop-summary-card">
          <div class="sop-summary-label">Purpose</div>
          <div class="sop-summary-text">${escapeHtml(module.purpose || '')}</div>
        </article>
        <article class="sop-summary-card">
          <div class="sop-summary-label">Use it when</div>
          <div class="sop-summary-text">${escapeHtml(module.whenToUse || '')}</div>
        </article>
        <article class="sop-summary-card">
          <div class="sop-summary-label">Expected result</div>
          <div class="sop-summary-text">${escapeHtml(module.result || '')}</div>
        </article>
      </div>
    `;
  }

  function renderSteps(module) {
    const steps = Array.isArray(module.steps) ? module.steps : [];
    if (!steps.length) return '';
    return `
      <div class="sop-block">
        <div class="sop-block-title">Recommended workflow</div>
        <div class="sop-steps-grid">
          ${steps.map((step, index) => `
            <article class="sop-step-card">
              <div class="sop-step-no">${index + 1}</div>
              <h4>${escapeHtml(step.title || `Step ${index + 1}`)}</h4>
              <p>${escapeHtml(step.body || '')}</p>
            </article>
          `).join('')}
        </div>
      </div>
    `;
  }

  function renderRules(module) {
    const rules = Array.isArray(module.rules) ? module.rules : [];
    if (!rules.length) return '';
    return `
      <div class="sop-block">
        <div class="sop-block-title">Rules & controls</div>
        <div class="sop-rules-list">
          ${rules.map((rule) => `
            <article class="sop-rule-card">
              <div class="sop-rule-icon"><i data-feather="check"></i></div>
              <div class="sop-rule-text">${escapeHtml(rule)}</div>
            </article>
          `).join('')}
        </div>
      </div>
    `;
  }

  function renderControls(module) {
    const controls = Array.isArray(module.controls) ? module.controls : [];
    if (!controls.length) return '';
    return `
      <div class="sop-controls-row">
        ${controls.map((control) => `
          <span class="sop-control-chip">${escapeHtml(control)}</span>
        `).join('')}
      </div>
    `;
  }

  function getSearchText(module) {
    const parts = [
      module.title,
      module.route,
      module.eyebrow,
      module.overview,
      module.purpose,
      module.whenToUse,
      module.result,
      ...(module.controls || []),
      ...(module.rules || []),
      ...(module.keywords || []),
      ...((module.steps || []).flatMap((step) => [step.title, step.body])),
    ];
    return parts.filter(Boolean).join(' ').toLowerCase();
  }

  function renderModule(module) {
    const searchText = escapeHtml(getSearchText(module));
    return `
      <section class="card sop-section" id="${escapeHtml(module.id)}" data-module-card data-search="${searchText}">
        <div class="sop-section-head">
          <div class="sop-title-wrap">
            <div class="sop-section-icon"><i data-feather="${escapeHtml(module.icon || 'circle')}"></i></div>
            <div>
              <div class="sop-eyebrow">${escapeHtml(module.eyebrow || 'Guide')}</div>
              <h3 class="sop-section-title">${escapeHtml(module.title || 'Guide section')}</h3>
              <p class="sop-section-overview">${escapeHtml(module.overview || '')}</p>
            </div>
          </div>
          <div class="sop-route-pill">${escapeHtml(module.route || 'In-app guide')}</div>
        </div>

        ${renderControls(module)}
        ${renderSummaryCards(module)}
        ${renderSteps(module)}
        ${renderRules(module)}
      </section>
    `;
  }

  function renderGuide(root, account, modules) {
    root.innerHTML = `
      <div class="sop-page-grid">
        ${renderHero(account, modules)}
        ${renderToolbar(modules)}
        <div class="sop-sections" id="sopSections">
          ${modules.map(renderModule).join('')}
        </div>
        <section class="card sop-footer-note">
          <div class="sop-footer-note__title">Permission-aware content</div>
          <p>
            This guide is rendered from your current access. If your allowed pages change in Notion, use <strong>Hard Refresh</strong>
            from the profile menu so the navigation and the SOP both update to the latest permission scope.
          </p>
        </section>
      </div>
    `;

    try {
      if (window.feather) window.feather.replace({ 'stroke-width': 2 });
    } catch {}
  }

  function activateChip(navRoot, id) {
    if (!navRoot) return;
    navRoot.querySelectorAll('.sop-nav-chip').forEach((chip) => {
      const active = chip.getAttribute('data-target') === id;
      chip.classList.toggle('is-active', active);
    });
  }

  function bindNavigation(root) {
    const navRoot = root.querySelector('#sopNav');
    if (!navRoot) return;
    navRoot.addEventListener('click', (event) => {
      const chip = event.target.closest('.sop-nav-chip[data-target]');
      if (!chip) return;
      const targetId = chip.getAttribute('data-target');
      const section = targetId ? document.getElementById(targetId) : null;
      if (!section) return;
      activateChip(navRoot, targetId);
      try {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch {
        section.scrollIntoView();
      }
    });

    const firstVisible = root.querySelector('.sop-section[data-module-card]');
    if (firstVisible) activateChip(navRoot, firstVisible.id);

    const scrollRoot = document.querySelector('.main-content > main') || null;
    const sections = Array.from(root.querySelectorAll('.sop-section[data-module-card]'));
    if (!sections.length || typeof IntersectionObserver !== 'function') return;

    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible || !visible.target?.id) return;
      activateChip(navRoot, visible.target.id);
    }, {
      root: scrollRoot,
      rootMargin: '-10% 0px -55% 0px',
      threshold: [0.2, 0.35, 0.55, 0.75],
    });

    sections.forEach((section) => observer.observe(section));
  }

  function bindSearch(root) {
    const input = root.querySelector('#sopSearchInput');
    const countEl = root.querySelector('#sopVisibleCount');
    const navRoot = root.querySelector('#sopNav');
    const sectionCards = Array.from(root.querySelectorAll('.sop-section[data-module-card]'));
    if (!input || !sectionCards.length) return;

    let timer = null;
    const applyFilter = () => {
      const query = normalize(input.value);
      let visibleCount = 0;

      sectionCards.forEach((section) => {
        const haystack = normalize(section.getAttribute('data-search'));
        const match = !query || haystack.includes(query);
        section.classList.toggle('is-hidden', !match);
        if (navRoot) {
          const chip = navRoot.querySelector(`.sop-nav-chip[data-target="${section.id}"]`);
          if (chip) chip.classList.toggle('is-hidden', !match);
        }
        if (match) visibleCount += 1;
      });

      if (countEl) {
        const total = sectionCards.length;
        countEl.textContent = query ? `${visibleCount} / ${total} matched` : `${total} sections`;
      }

      if (navRoot) {
        const firstChip = navRoot.querySelector('.sop-nav-chip:not(.is-hidden)');
        if (firstChip) activateChip(navRoot, firstChip.getAttribute('data-target'));
      }
    };

    input.addEventListener('input', () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(applyFilter, SEARCH_DEBOUNCE_MS);
    });
  }

  function renderError(root, message) {
    root.innerHTML = `
      <section class="card sop-error-card">
        <div class="sop-error-icon"><i data-feather="alert-circle"></i></div>
        <h2>Guide unavailable right now</h2>
        <p>${escapeHtml(message || 'The guide could not be loaded at the moment.')}</p>
        <p>Use Hard Refresh from the profile menu, then open this page again.</p>
      </section>
    `;
    try {
      if (window.feather) window.feather.replace({ 'stroke-width': 2 });
    } catch {}
  }

  async function init() {
    const root = document.getElementById('sopApp');
    if (!root) return;

    try {
      const account = await loadAccount();
      const modules = getVisibleModules(account);
      renderGuide(root, account, modules);
      bindNavigation(root);
      bindSearch(root);
    } catch (error) {
      console.error('How it works init failed:', error);
      renderError(root, error?.message || 'Failed to load the page guide.');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
