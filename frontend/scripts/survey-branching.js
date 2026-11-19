// Customer feedback survey — branching for the Shopify Forms survey on
// /pages/customer-feedback-survey (form 1217788). Shopify Forms has no
// conditional logic, so this adds it from outside, following the survey brief:
//
//   - Q8–Q9 only for buyers, Q10–Q11 only for everyone else (Q1)
//   - Q4a only when Q4 is "Very" or "Somewhat difficult"
//   - each "Other" text box only when its question's Other is picked
//   - "None…" / "Nothing…" answers clear the others, and the reverse
//   - Q12 (delivery) takes at most three answers
//   - answer order shuffled per visit, except lock-order questions and the
//     anchored answers (Other, None, Don't remember, I'm not sure), which stay
//     last
//   - every visible choice question, and every visible Other box, must be
//     answered before the form submits
//
// Hidden questions are emptied, so a buyer's abandoned non-buyer answers are
// never sent. Text in a hidden box (an Other, Q4a) is set aside and comes back
// if the box shows again. Visual rules (hidden, error, order) live in
// _shopify-forms-shadow.scss, keyed on the data-survey-* attributes set here.
//
// Questions are found by their field names (`custom#…`), which don't change
// when wording is edited in the Forms app. A field deleted and re-added comes
// back with _1 (then _1_1…) on its name; those match too. If Q1 can't be found the script does
// nothing and the form behaves as the app made it: every question showing,
// with the app's own required settings. So in the Forms app, only questions
// that can be hidden need to be optional.

const FORM_ID = '1217788';

const PURCHASED = "I've made a purchase";
const bought = (a) => a.q1.length > 0 && a.q1[0] === PURCHASED;
const notBought = (a) => a.q1.length > 0 && a.q1[0] !== PURCHASED;

// `name`: the field name without its `custom#` prefix. `other`: the text box
// for that question's Other answer. `lock`: keep the answer order. `open`: a
// free-text question, optional. `when`: shown only when this returns true.
const QUESTIONS = [
  { id: 'q1', name: 'which_best_describes_your_experience_with_weloveus_shop', lock: true },
  // Q2 is a dropdown; it is found as the question before its Other box.
  { id: 'q2', select: true, other: 'if_you_selected_other_please_elaborate' },
  { id: 'q3', name: 'why_are_you_visiting_weloveus_shop', other: 'why_are_you_visiting_other_' },
  { id: 'q4', name: 'how_difficult_is_it_to_find_products_youre_interested_in', lock: true },
  {
    id: 'q4a',
    name: 'what_made_it_difficult_to_find_what_you_were_looking_for',
    open: true,
    followup: true, // numbered as its parent's "a", e.g. 4a
    when: (a) => !a.q4 || a.q4.some((v) => /^(very|somewhat) difficult/i.test(v)),
  },
  {
    id: 'q5',
    name: 'what_could_we_improve_about_your_experience',
    other: 'what_could_we_improve_about_your_experience_-_other',
    exclusive: /^nothing\b/i,
  },
  {
    id: 'q6',
    name: 'which_best_describes_your_understanding_of_wlu',
    other: 'which_describes_your_understanding_of_weloveus_-_other',
  },
  { id: 'q7', name: 'mission_influence_on_shopping_on_weloveus', lock: true },
  {
    id: 'q8',
    name: 'what_made_you_decide_to_buy_something_on_weloveusshop',
    other: 'decision_to_buy_something_on_wlu_-_other',
    when: bought,
  },
  {
    id: 'q9',
    name: 'what_helped_you_feel_confident_in_purchasing_from_us',
    other: 'confidence_in_purchasing_-_other',
    exclusive: /^none of the above/i,
    when: bought,
  },
  {
    id: 'q10',
    name: 'why_havent_you_made_a_purchase_from_weloveusshop',
    other: 'why_havent_you_made_a_purchase_-_other',
    when: notBought,
  },
  {
    id: 'q11',
    name: 'what_would_make_you_more_likely_to_purchase_from_wlu',
    other: 'what_would_make_you_more_likely_to_purchase_-_other',
    when: notBought,
  },
  {
    id: 'q12',
    name: 'what_matters_most_to_you_when_it_comes_to_online_delivery',
    other: 'whats_most_important_to_you_re_online_delivery_-_other',
    exclusive: /^none of the above/i,
    max: 3,
  },
  { id: 'q12b', name: 'what_would_you_like_to_see_more_of_on_weloveusshop_', exclusive: /^none\b/i },
  { id: 'q13', name: 'how_can_we_make_weloveusshop_better_for_you', open: true },
];

// Answers that stay at the end of a shuffled list, in their set order.
const ANCHOR = /^(other|none|nothing|don't remember|i'm not sure)\b/i;
const OTHER = /^other\b/i;

const MESSAGES = {
  required: 'Please choose an answer.',
  other: 'Please tell us more.',
  max: 'Please pick up to three.',
  summary: 'Please answer the highlighted questions.',
};

// The prompt in every "Other" box, in place of the field names the app shows.
const OTHER_PROMPT = 'Tell us more';

// A question's inputs (or text box) by field name, with or without the _1,
// _1_1… the app adds to a re-added field. Inputs only: the app gives a
// question's fieldset the same name.
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const fieldsNamed = (root, base) => {
  const pattern = new RegExp(`^custom#${escapeRe(base)}(_\\d+)*$`);
  return [...root.querySelectorAll('input[name], textarea[name]')].filter((el) => pattern.test(el.name));
};

// Values carry stray spaces and mixed apostrophes from the app.
const norm = (s) => (s || '').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();

const setTextValue = (el, value) => {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
  Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
};

class SurveyBranching {
  constructor(shadowRoot) {
    this.shadowRoot = shadowRoot;
    this.busy = false;
    this.frame = 0;
    this.stash = new Map(); // field name → text set aside from a hidden box
  }

  // Finds each question's element (the form's direct child) and inputs.
  // False when the survey isn't (or is no longer) on the page.
  index() {
    const form = this.shadowRoot.querySelector('form');
    if (!form) return false;
    const field = (name) => fieldsNamed(form, name)[0];
    const questionOf = (node) => {
      while (node && node.parentElement !== form) node = node.parentElement;
      return node;
    };

    const q1 = field(QUESTIONS[0].name);
    if (!q1) return false;

    this.form = form;
    this.questions = QUESTIONS.map((spec) => {
      const otherEl = spec.other ? questionOf(field(spec.other)) : null;
      let el = null;
      if (spec.select) el = otherEl?.previousElementSibling || null;
      else el = questionOf(field(spec.name));
      if (!el) return null;
      const inputs = spec.select ? [] : fieldsNamed(form, spec.name);
      return { ...spec, el, otherEl, otherInput: otherEl?.querySelector('textarea, input'), inputs };
    }).filter(Boolean);
    this.byId = Object.fromEntries(this.questions.map((q) => [q.id, q]));
    this.byName = new Map(this.questions.flatMap((q) => q.inputs.map((i) => [i.name, q])));
    // Numbering: CSS counts the visible questions, so it runs 1, 2, 3… for
    // every path through the survey.
    this.questions.forEach((q) => {
      q.el.dataset.surveyQuestion = q.followup ? 'followup' : '';
      // A free-text question (not a follow-up) is styled like the rest, its
      // question above the box rather than floating inside it.
      if (q.open && !q.followup) q.el.dataset.surveyOpen = '';
    });
    this.shuffle();
    return true;
  }

  // Shuffles answer order through CSS `order` (the DOM stays the app's).
  shuffle() {
    this.questions.forEach((q) => {
      if (q.lock || q.open || q.select) return;
      const labels = q.inputs.map((input) => input.closest('label'));
      if (!labels.length || labels.some((l) => !l) || labels[0].dataset.surveyOrder) return;
      const rest = labels.filter((l, i) => !ANCHOR.test(norm(q.inputs[i].value)));
      const anchors = labels.filter((l, i) => ANCHOR.test(norm(q.inputs[i].value)));
      for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rest[i], rest[j]] = [rest[j], rest[i]];
      }
      [...rest, ...anchors].forEach((label, i) => {
        label.dataset.surveyOrder = String(i);
      });
    });
  }

  // A question's answers, normalised. Null when it can't be read (the
  // dropdown, if the app draws it in a way this doesn't recognise).
  answers(q) {
    if (q.select) {
      const select = q.el.querySelector('select');
      if (select) return select.value ? [norm(select.selectedOptions[0]?.text || select.value)] : [];
      const box = q.el.querySelector('[role="combobox"], button');
      return box ? [norm(box.textContent)].filter(Boolean) : null;
    }
    if (q.open) {
      const box = q.inputs[0];
      return box && norm(box.value) ? [norm(box.value)] : [];
    }
    return q.inputs.filter((i) => i.checked).map((i) => norm(i.value));
  }

  allAnswers() {
    return Object.fromEntries(this.questions.map((q) => [q.id, this.answers(q) || []]));
  }

  isVisible(q, all) {
    return !q.when || q.when(all);
  }

  // Shown when its question is, and Other is picked. Shown when the answer
  // can't be read, so it's never out of reach.
  otherVisible(q, all) {
    if (!q.otherEl || !this.isVisible(q, all)) return false;
    const answers = this.answers(q);
    return answers === null || answers.some((v) => OTHER.test(v));
  }

  // `clear` runs as the element hides, `restore` as it shows again.
  setHidden(el, hidden, clear, restore) {
    const was = el.hasAttribute('data-survey-hidden');
    el.toggleAttribute('data-survey-hidden', hidden);
    if (hidden) {
      el.removeAttribute('data-survey-error');
      if (!was) clear();
    } else if (was) {
      restore?.();
    }
  }

  // Text in a box that hides is set aside rather than sent: the box is
  // emptied (the app submits whatever its fields hold) and the text goes back
  // if the box shows again, e.g. someone picks Other, writes, picks something
  // else, then returns to Other.
  stashText(input) {
    if (!input?.value) return;
    this.stash.set(input.name, input.value);
    setTextValue(input, '');
  }

  restoreText(input) {
    const text = input && this.stash.get(input.name);
    if (!text) return;
    this.stash.delete(input.name);
    if (!input.value) setTextValue(input, text);
  }

  // Ticks in a question that hides are cleared; its free text is set aside.
  clearChoices(q) {
    this.uncheck(q.inputs.filter((i) => i.checked && i.type === 'checkbox'));
    if (q.open) this.stashText(q.inputs[0]);
  }

  // Clicks go through the app's own handlers, so its state stays in step.
  uncheck(inputs) {
    if (!inputs.length) return;
    setTimeout(() => {
      this.busy = true;
      inputs.forEach((i) => i.checked && i.click());
      this.busy = false;
      this.schedule();
    });
  }

  schedule() {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.apply());
  }

  apply() {
    // The app re-rendered the form from scratch, or replaced it with its
    // thank-you message.
    if (!this.form?.isConnected || !this.byId.q1?.el.isConnected) {
      if (!this.index()) return;
    }
    const all = this.allAnswers();
    this.questions.forEach((q) => {
      this.setHidden(
        q.el,
        !this.isVisible(q, all),
        () => this.clearChoices(q),
        () => q.open && this.restoreText(q.inputs[0]),
      );
      if (q.otherEl) {
        this.setHidden(
          q.otherEl,
          !this.otherVisible(q, all),
          () => this.stashText(q.otherInput),
          () => this.restoreText(q.otherInput),
        );
        // Checked each pass, as the app may redraw the label.
        // Text-only labels, so the box itself is never caught up in it.
        const label = q.otherEl.querySelector('label');
        if (label && !label.children.length && label.textContent !== OTHER_PROMPT) {
          label.textContent = OTHER_PROMPT;
        }
      }
      // Errors clear as soon as they're answered.
      if (q.el.dataset.surveyError === MESSAGES.required && this.answers(q)?.length) {
        q.el.removeAttribute('data-survey-error');
      }
      if (q.otherEl?.dataset.surveyError && norm(q.otherInput?.value)) {
        q.otherEl.removeAttribute('data-survey-error');
      }
    });
  }

  // Exclusive answers and Q12's limit of three.
  onChange(event) {
    const input = event.target;
    if (this.busy) return;
    const q = this.byName?.get(input.name);
    if (q && input.type === 'checkbox') {
      if (q.el.dataset.surveyError === MESSAGES.max) q.el.removeAttribute('data-survey-error');
      if (input.checked) {
        const checked = q.inputs.filter((i) => i.checked && i !== input);
        const isExclusive = (i) => q.exclusive?.test(norm(i.value));
        if (q.exclusive) this.uncheck(isExclusive(input) ? checked : checked.filter(isExclusive));
        if (q.max && !isExclusive(input) && checked.filter((i) => !isExclusive(i)).length >= q.max) {
          this.uncheck([input]);
          q.el.dataset.surveyError = MESSAGES.max;
        }
      }
    }
    this.schedule();
  }

  // Returns the elements still needing an answer, flagging each.
  validate() {
    const all = this.allAnswers();
    const invalid = [];
    this.questions.forEach((q) => {
      if (!this.isVisible(q, all)) return;
      // The dropdown only when it is a real <select>, whose value is certain.
      const enforce = !q.open && (!q.select || q.el.querySelector('select'));
      if (enforce && !this.answers(q)?.length) {
        q.el.dataset.surveyError = MESSAGES.required;
        invalid.push(q.el);
      }
      if (this.otherVisible(q, all) && !norm(q.otherInput?.value)) {
        q.otherEl.dataset.surveyError = MESSAGES.other;
        invalid.push(q.otherEl);
      }
    });
    return invalid;
  }

  // Runs before the app's handlers (capture, on the shadow root) and stops
  // the submit when something visible is unanswered.
  onSubmit(event) {
    if (event.type === 'click' && !event.target.closest?.('button[type="submit"]')) return;
    if (!this.form?.isConnected) return;
    const invalid = this.validate();
    if (!invalid.length) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const first = invalid[0];
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    first.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    first.querySelector('input, textarea, select, button')?.focus({ preventScroll: true });
    this.announce(MESSAGES.summary);
  }

  announce(message) {
    if (!this.live) {
      this.live = document.createElement('p');
      this.live.className = 'visually-hidden';
      this.live.setAttribute('role', 'status');
      document.body.append(this.live);
    }
    this.live.textContent = '';
    requestAnimationFrame(() => {
      this.live.textContent = message;
    });
  }

  start() {
    const root = this.shadowRoot;
    root.addEventListener('change', (e) => this.onChange(e));
    root.addEventListener('input', () => this.schedule());
    root.addEventListener('click', (e) => this.onSubmit(e), true);
    root.addEventListener('submit', (e) => this.onSubmit(e), true);
    // The dropdown, and any re-render by the app.
    new MutationObserver(() => this.schedule()).observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    this.apply();
  }
}

// The app's loader adds the form some time after the page loads, and draws
// its questions a little after that.
const root = document.querySelector(`[data-forms-id="forms-root-${FORM_ID}"]`);
if (root) {
  const ready = (host) => host.shadowRoot && fieldsNamed(host.shadowRoot, QUESTIONS[0].name).length > 0;
  const watch = (host) => {
    if (host.dataset.surveyBranching) return;
    if (!host.shadowRoot) {
      requestAnimationFrame(() => watch(host));
      return;
    }
    const begin = () => {
      if (host.dataset.surveyBranching || !ready(host)) return false;
      host.dataset.surveyBranching = '';
      const survey = new SurveyBranching(host.shadowRoot);
      if (survey.index()) survey.start();
      return true;
    };
    if (begin()) return;
    const observer = new MutationObserver(() => begin() && observer.disconnect());
    observer.observe(host.shadowRoot, { childList: true, subtree: true });
  };
  const check = () => root.querySelectorAll('shopify-forms-embed').forEach(watch);
  check();
  new MutationObserver(check).observe(root, { childList: true, subtree: true });
}
