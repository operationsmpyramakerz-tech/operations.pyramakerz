// funds.js - Mission Expenses Form Handler

let expenseCounter = 0;
let FUNDS_TYPE_OPTIONS = [];
async function loadFundsTypeOptions() {
  try {
    const res = await fetch('/api/funds/options', { credentials: 'same-origin' });
    if (!res.ok) throw new Error('Failed to load options');
    const data = await res.json();
    FUNDS_TYPE_OPTIONS = Array.isArray(data.options) ? data.options : [];
  } catch (e) {
    // fallback list
    FUNDS_TYPE_OPTIONS = ['Transportation','Accommodation','Meals','Fuel','Equipment','Communication','Other'];
  }
}
function populateFundsTypeSelect(selectEl, selected) {
  if (!selectEl) return;
  selectEl.innerHTML = '';
  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = 'Select expense type...';
  selectEl.appendChild(defaultOpt);
  const list = FUNDS_TYPE_OPTIONS && FUNDS_TYPE_OPTIONS.length ? FUNDS_TYPE_OPTIONS : ['Transportation','Accommodation','Meals','Fuel','Equipment','Communication','Other'];
  for (const name of list) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    if (selected && selected === name) opt.selected = true;
    selectEl.appendChild(opt);
  }
}


document.addEventListener('DOMContentLoaded', function() {
  // Initialize the page
  initializePage();

  // Add event listeners
  document.getElementById('addExpenseBtn').addEventListener('click', addExpenseEntry);
  document.getElementById('fundsForm').addEventListener('submit', handleFormSubmit);

  // Check database configuration
  checkDatabaseConfiguration();

  // Add initial expense entry
  addExpenseEntry();
});

async function initializePage() { await loadFundsTypeOptions();  await loadFundsTypeOptions();
  // Set up logout functionality
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }

  // Initialize sidebar toggle

}

function addExpenseEntry() {
  expenseCounter++;

  const expensesList = document.getElementById('expensesList');
  const expenseDiv = document.createElement('div');
  expenseDiv.className = 'expense-entry';
  expenseDiv.dataset.expenseId = expenseCounter;

  expenseDiv.innerHTML = `
    <div class="expense-header">
      <h4><i data-feather="receipt"></i> Expense ${expenseCounter}</h4>
      <button type="button" class="expense-status remove-expense" data-expense-id="${expenseCounter}" title="Delete expense"></button>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label for="fundsType${expenseCounter}" class="form-label">
          <i data-feather="tag"></i>
          Funds Type *
        </label>
        <select
          id="fundsType${expenseCounter}"
          name="expenses[${expenseCounter}][fundsType]"
          class="form-select"
          required
        >
          <option value="">Select expense type...</option>
          <option value="Transportation">Transportation</option>
          <option value="Accommodation">Accommodation</option>
          <option value="Meals">Meals</option>
          <option value="Fuel">Fuel</option>
          <option value="Equipment">Equipment</option>
          <option value="Communication">Communication</option>
          <option value="Other">Other</option>
        </select>
      </div>

      <div class="form-group">
        <label for="date${expenseCounter}" class="form-label">
          <i data-feather="calendar"></i>
          Date *
        </label>
        <input
          type="date"
          id="date${expenseCounter}"
          name="expenses[${expenseCounter}][date]"
          class="form-input"
          required
        />
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label for="from${expenseCounter}" class="form-label">
          <i data-feather="map-pin"></i>
          From *
        </label>
        <input
          type="text"
          id="from${expenseCounter}"
          name="expenses[${expenseCounter}][from]"
          class="form-input"
          placeholder="Starting location"
          required
        />
      </div>

      <div class="form-group">
        <label for="to${expenseCounter}" class="form-label">
          <i data-feather="navigation"></i>
          To *
        </label>
        <input
          type="text"
          id="to${expenseCounter}"
          name="expenses[${expenseCounter}][to]"
          class="form-input"
          placeholder="Destination location"
          required
        />
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label for="cost${expenseCounter}" class="form-label">
          <i data-feather="dollar-sign"></i>
          Cost *
        </label>
        <input
          type="number"
          id="cost${expenseCounter}"
          name="expenses[${expenseCounter}][cost]"
          class="form-input"
          placeholder="0.00"
          min="0"
          step="0.01"
          required
        />
      </div>

      <div class="form-group">
        <label for="screenshot${expenseCounter}" class="form-label">
          <i data-feather="image"></i>
          Receipt Screenshot
        </label>
        <input
          type="file"
          id="screenshot${expenseCounter}"
          name="expenses[${expenseCounter}][screenshot]"
          class="form-input"
          accept="image/*,.pdf"
        />
        <small class="form-help">Upload receipt image or PDF (optional)</small>
      </div>
    </div>
  `;

  expensesList.appendChild(expenseDiv);

  // Add event listener for remove button
  const removeBtn = expenseDiv.querySelector('.remove-expense');
  removeBtn.addEventListener('click', function() {
    removeExpenseEntry(expenseCounter);
  });

  // Re-initialize Feather icons for new elements
  feather.replace();

  // Focus on the funds type select for the new entry
  document.getElementById(`fundsType${expenseCounter}`).focus();
}

function removeExpenseEntry(expenseId) {
  const expenseDiv = document.querySelector(`[data-expense-id="${expenseId}"]`);
  if (expenseDiv) {
    // Don't allow removing the last expense entry
    const totalExpenses = document.querySelectorAll('.expense-entry').length;
    if (totalExpenses <= 1) {
      showToast('At least one expense entry is required', 'error');
      return;
    }

    expenseDiv.remove();
  }
}

async function handleFormSubmit(e) {
  e.preventDefault();

  const submitBtn = document.getElementById('submitBtn');
  const formData = new FormData(e.target);

  try {
    // Disable submit button
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i data-feather="loader"></i> Submitting...';
    feather.replace();

    // Validate form
    if (!validateForm(formData)) {
      return;
    }

    // Convert form data to structured data
    const missionData = await processFormData(formData);

    console.log('Submitting mission data:', missionData);

    // Submit to API
    const response = await fetch('/api/funds', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'same-origin',
      body: JSON.stringify(missionData)
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', response.headers);

    // Check if response is JSON
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.error('Non-JSON response:', text.substring(0, 500));
      throw new Error('Server configuration error. Please check Notion database setup.');
    }

    const result = await response.json();
    console.log('API result:', result);

    if (response.ok && result.success) {
      showToast(result.message || 'Mission expenses submitted successfully!', 'success');
      resetFormCompletely();
    } else {
      // Handle specific error cases
      if (result.error && result.error.includes('database with ID')) {
        throw new Error('Funds database not found. Please check Notion integration setup.');
      } else if (result.error && result.error.includes('not configured')) {
        throw new Error('Database configuration error. Please contact administrator.');
      } else {
        throw new Error(result.error || 'Failed to submit mission expenses');
      }
    }

  } catch (error) {
    console.error('Error submitting funds:', error);
    let errorMessage = 'Error submitting mission expenses';

    if (error.message.includes('Funds database not found')) {
      errorMessage = 'Funds database not found. Please check Replit Secrets and Notion integration.';
    } else if (error.message.includes('Database configuration')) {
      errorMessage = 'Database configuration error. Please contact administrator.';
    } else if (error.message.includes('Server configuration')) {
      errorMessage = 'Server configuration error. Please check database setup.';
    } else if (error.message.includes('Failed to fetch')) {
      errorMessage = 'Network error. Please check your connection and try again.';
    } else {
      errorMessage = error.message || errorMessage;
    }

    showToast(errorMessage, 'error');
  } finally {
    // Re-enable submit button
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i data-feather="save"></i> Submit Mission Expenses';
    feather.replace();
  }
}

function validateForm(formData) {
  const assignment = formData.get('assignment');
  if (!assignment || assignment.trim().length === 0) {
    showToast('Mission name is required', 'error');
    return false;
  }

  // Check if at least one expense is properly filled
  const expenses = document.querySelectorAll('.expense-entry');
  let hasValidExpense = false;

  for (const expense of expenses) {
    const fundsTypeInput = expense.querySelector('[name*="[fundsType]"]');
    const dateInput = expense.querySelector('[name*="[date]"]');
    const fromInput = expense.querySelector('[name*="[from]"]');
    const toInput = expense.querySelector('[name*="[to]"]');
    const costInput = expense.querySelector('[name*="[cost]"]');

    if (fundsTypeInput.value && dateInput.value && fromInput.value && 
        toInput.value && costInput.value && parseFloat(costInput.value) > 0) {
      hasValidExpense = true;
      break;
    }
  }

  if (!hasValidExpense) {
    showToast('At least one complete expense entry is required', 'error');
    return false;
  }

  return true;
}

async function processFormData(formData) {
  const assignment = formData.get('assignment');
  const expenses = [];

  // Process each expense entry
  const expenseEntries = document.querySelectorAll('.expense-entry');

  for (const entry of expenseEntries) {
    const expenseId = entry.dataset.expenseId;

    const fundsType = formData.get(`expenses[${expenseId}][fundsType]`);
    const date = formData.get(`expenses[${expenseId}][date]`);
    const from = formData.get(`expenses[${expenseId}][from]`);
    const to = formData.get(`expenses[${expenseId}][to]`);
    const cost = formData.get(`expenses[${expenseId}][cost]`);
    const screenshot = formData.get(`expenses[${expenseId}][screenshot]`);

    // Only include expenses with required fields filled
    if (fundsType && date && from && to && cost && parseFloat(cost) > 0) {
      const expense = {
        fundsType,
        date,
        from,
        to,
        cost: parseFloat(cost)
      };

      // Handle file upload if present
      if (screenshot && screenshot.size > 0) {
        // For now, just include the file info
        // Note: Actual file upload to Notion requires additional implementation
        expense.screenshotName = screenshot.name;
        expense.screenshotType = screenshot.type;
        expense.screenshotSize = screenshot.size;
      }

      expenses.push(expense);
    }
  }

  return {
    assignment: assignment.trim(),
    expenses
  };
}

// Note: File upload functionality temporarily simplified
// Future enhancement: Implement proper file upload to cloud storage
// and store the URL in Notion's file property

function resetExpenseEntries() {
  // Remove all expense entries
  const expensesList = document.getElementById('expensesList');
  expensesList.innerHTML = '';

  // Reset counter and add one initial entry
  expenseCounter = 0;
  addExpenseEntry();
}

function resetFormCompletely() {
  // Reset the main form
  document.getElementById('fundsForm').reset();

  // Clear assignment field specifically
  document.getElementById('assignment').value = '';

  // Remove all expense entries and add a fresh one
  const expensesList = document.getElementById('expensesList');
  expensesList.innerHTML = '';

  // Reset counter and add one initial entry
  expenseCounter = 0;
  addExpenseEntry();

  // Focus on assignment field
  document.getElementById('assignment').focus();
}

function showToast(message, type = 'info') {
  if (typeof UI !== 'undefined' && UI.toast) {
    UI.toast({ type, message });
  } else {
    // Fallback alert if UI toast is not available
    alert(message);
  }
}

async function handleLogout() {
  try {
    const response = await fetch('/api/logout', {
      method: 'POST',
      credentials: 'same-origin'
    });

    if (response.ok) {
      window.location.href = '/login';
    }
  } catch (error) {
    console.error('Logout error:', error);
    window.location.href = '/login';
  }
}


async function checkDatabaseConfiguration() {
  try {
    const response = await fetch('/api/funds/check', {
      method: 'GET',
      credentials: 'same-origin'
    });

    const result = await response.json();

    if (!response.ok || !result.configured) {
      console.error('Funds database configuration issue:', result.error);
      showToast('âŒ Funds database not accessible. Please check Replit Secrets and Notion sharing permissions.', 'error');
    } else {
      console.log('âœ… Funds database configured:', result.title);
      showToast('âœ… Funds database connected successfully', 'success');
    }
  } catch (error) {
    console.error('Could not check database configuration:', error);
    showToast('âš ï¸ Cannot verify database connection. Please check your setup.', 'warning');
  }
}