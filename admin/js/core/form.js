/*
  Reusable accessible form fields for the Admin CMS.

  Every field ships with:
    - a real <label for> bound to the control,
    - optional help text wired through aria-describedby,
    - an error slot that toggles aria-invalid and extends aria-describedby.

  SECURITY: labels, help text and error messages are written with textContent.
  Nothing here assigns innerHTML.

  NOTE: js/modules/technologies.js still carries its own private copy of these
  builders from Phase 4. It is intentionally left untouched here to keep this
  phase's blast radius on Profile & About; migrating it onto this module is a
  clean follow-up.
*/

import { el, append } from "./dom.js";

function fieldShell({ id, label, required, help }) {
  const node = el("div", "form-field");

  const labelNode = el("label", "form-label");
  labelNode.htmlFor = id;
  labelNode.textContent = label;

  if (required) {
    const marker = el("span", "form-required", " *");
    marker.setAttribute("aria-hidden", "true");
    append(labelNode, marker);
  }

  append(node, labelNode);

  const helpNode = help ? el("p", "form-help", help) : null;
  const errorNode = el("p", "field-error");
  errorNode.id = `${id}-error`;

  return { node, labelNode, helpNode, errorNode };
}

function attachMeta(shell, control, id) {
  if (shell.helpNode) {
    shell.helpNode.id = `${id}-help`;
    append(shell.node, shell.helpNode);
    control.setAttribute("aria-describedby", shell.helpNode.id);
  }

  append(shell.node, shell.errorNode);

  return function setError(message) {
    shell.errorNode.textContent = message || "";

    const describedBy = [];

    if (shell.helpNode) {
      describedBy.push(shell.helpNode.id);
    }

    if (message) {
      describedBy.push(shell.errorNode.id);
      control.setAttribute("aria-invalid", "true");
      shell.node.classList.add("has-error");
    } else {
      control.removeAttribute("aria-invalid");
      shell.node.classList.remove("has-error");
    }

    if (describedBy.length > 0) {
      control.setAttribute("aria-describedby", describedBy.join(" "));
    } else {
      control.removeAttribute("aria-describedby");
    }
  };
}

function baseField(control, shell, id) {
  const setError = attachMeta(shell, control, id);

  return {
    node: shell.node,
    control,
    errorNode: shell.errorNode,
    setError,
    focus: () => control.focus(),
    get value() {
      return control.value;
    },
    set value(next) {
      control.value = next === null || next === undefined ? "" : String(next);
    }
  };
}

export function textField({ id, label, required, maxLength, value, help, placeholder }) {
  const shell = fieldShell({ id, label, required, help });

  const input = el("input", "admin-input");
  input.type = "text";
  input.id = id;
  input.value = value === null || value === undefined ? "" : String(value);
  input.autocomplete = "off";

  if (maxLength) {
    input.maxLength = maxLength;
  }

  if (required) {
    input.required = true;
  }

  if (placeholder) {
    input.placeholder = placeholder;
  }

  append(shell.node, input);

  return baseField(input, shell, id);
}

export function textareaField({ id, label, required, maxLength, value, help, rows }) {
  const shell = fieldShell({ id, label, required, help });

  const area = el("textarea", "admin-textarea");
  area.id = id;
  area.rows = rows || 4;
  area.value = value === null || value === undefined ? "" : String(value);

  if (maxLength) {
    area.maxLength = maxLength;
  }

  if (required) {
    area.required = true;
  }

  append(shell.node, area);

  return baseField(area, shell, id);
}

/*
  Select built on the same shell as textField, so a dropdown carries the same
  label/help/error wiring as every other field.

  `options` is [{ value, label }]. Option text is set with textContent through
  el(), never innerHTML, and callers are expected to pass a fixed allow-list —
  the Certificate category picker passes the frozen category table.
*/
export function selectField({ id, label, required, options = [], value, help }) {
  const shell = fieldShell({ id, label, required, help });

  const select = el("select", "admin-select");
  select.id = id;

  options.forEach(option => {
    const node = el("option", null, option.label);
    node.value = option.value;
    append(select, node);
  });

  if (required) {
    select.required = true;
  }

  if (value !== null && value !== undefined && value !== "") {
    select.value = String(value);
  }

  append(shell.node, select);

  return baseField(select, shell, id);
}

export function checkboxField({ id, label, checked, help }) {
  const node = el("div", "form-field form-field-toggle");

  const input = el("input", "admin-checkbox");
  input.type = "checkbox";
  input.id = id;
  input.checked = Boolean(checked);

  const labelNode = el("label", "form-toggle-label", label);
  labelNode.htmlFor = id;

  append(node, input, labelNode);

  if (help) {
    const helpNode = el("p", "form-help form-help-inline", help);
    helpNode.id = `${id}-help`;
    input.setAttribute("aria-describedby", helpNode.id);
    append(node, helpNode);
  }

  return {
    node,
    control: input,
    errorNode: el("p"),
    setError: () => {},
    focus: () => input.focus(),
    get value() {
      return input.checked;
    },
    set value(next) {
      input.checked = Boolean(next);
    }
  };
}

/*
  Length/required validation that mirrors the database constraints.
  Input is never silently truncated: an over-long value is reported, not cut.
*/
export function validateText(value, { label, required, maxLength }) {
  const text = String(value === null || value === undefined ? "" : value).trim();

  if (required && text === "") {
    return `${label} is required.`;
  }

  if (maxLength && text.length > maxLength) {
    return `${label} must be ${maxLength} characters or fewer (currently ${text.length}).`;
  }

  return "";
}

/*
  Applies a validation map to a field map and returns whether everything passed.
  rules: { fieldKey: { label, required, maxLength } }
*/
export function applyValidation(fields, rules) {
  let firstInvalid = null;

  Object.keys(rules).forEach(key => {
    const field = fields[key];

    if (!field) {
      return;
    }

    const message = validateText(field.value, rules[key]);
    field.setError(message);

    if (message && !firstInvalid) {
      firstInvalid = field;
    }
  });

  if (firstInvalid) {
    firstInvalid.focus();
    return false;
  }

  return true;
}

/*
  Trims a value for storage and converts empty strings to null so optional
  columns stay NULL rather than '' (ADMIN-CMS-DATABASE.md section 43).
*/
export function trimmedOrNull(value) {
  const text = String(value === null || value === undefined ? "" : value).trim();
  return text === "" ? null : text;
}

export function trimmed(value) {
  return String(value === null || value === undefined ? "" : value).trim();
}
