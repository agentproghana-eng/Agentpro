// help_guide_screen.dart
import 'package:flutter/material.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/theme/app_colors.dart';

class HelpItem {
  final String question;
  final String answer;
  const HelpItem({required this.question, required this.answer});
}

class HelpSection {
  final String title;
  final IconData icon;
  final List<HelpItem> items;
  const HelpSection(
      {required this.title, required this.icon, required this.items});
}

final List<HelpSection> _helpSections = [
  const HelpSection(
      title: 'Getting Started',
      icon: Icons.flag_outlined,
      items: [
        HelpItem(
          question: 'How do I get my company set up?',
          answer:
              'A business owner registers the company first. A superuser reviews and approves the registration. Once approved, a default branch is created automatically and the owner is assigned to it, so transacting can start right away.',
        ),
        HelpItem(
          question: 'What happens after approval?',
          answer:
              'Every approved company gets a 30-day free trial before a paid subscription is required.',
        ),
        HelpItem(
          question: 'How do new staff get their login details?',
          answer:
              'A temporary password is automatically generated and sent by email. It must be changed the first time they log in.',
        ),
      ]),
  const HelpSection(
      title: 'Making a Transaction',
      icon: Icons.swap_horiz,
      items: [
        HelpItem(
          question: 'What transactions can I use?',
          answer:
              'The app shows the transaction options currently available for your provider and account mode. Available options may change as services and flows are updated.',
        ),
        HelpItem(
          question: 'How does the automatic dialing work?',
          answer:
              'Tapping a transaction type starts the available automated USSD flow, so you do not need to dial and navigate the network menu yourself. The app pauses when the network asks for your MoMo PIN. Enter the PIN only on the real network screen, then continue the transaction.',
        ),
        HelpItem(
          question:
              "Why can't I see my float balance on the transaction screen?",
          answer:
              'This is deliberate, for security. Check "My Balance" separately.',
        ),
        HelpItem(
          question: 'Which SIM does a transaction use?',
          answer:
              'The app automatically detects which SIM slot has each network and dials from the correct one — no manual SIM switching needed.',
        ),
        HelpItem(
          question: 'Will the AI Assistant ever ask for my PIN?',
          answer:
              'Never. If anything — including this assistant — asks for the MoMo PIN, do not share it. The PIN should only ever be entered on the real network USSD screen.',
        ),
      ]),
  const HelpSection(
      title: 'My Balance (Float)',
      icon: Icons.account_balance_wallet_outlined,
      items: [
        HelpItem(
          question: 'What balances can I see?',
          answer:
              'Balances depend on the provider and physical SIM. AgentPro can show Cash at Hand plus SIM-wallet balances such as Working Account, Float or e-Float, and Commission where that provider exposes them.',
        ),
        HelpItem(
          question: 'How do I record float received?',
          answer:
              'Tap "Declare Float" under the relevant provider on the My Balance screen.',
        ),
        HelpItem(
          question: 'How do I record a cash adjustment?',
          answer: 'Tap "Adjust Cash" under the relevant provider.',
        ),
        HelpItem(
          question: 'How do I move commission into usable float?',
          answer:
              "Use the Transfer Commission action for the selected SIM. The destination is shown as Float or e-Float according to that provider, and the network's own response confirms success.",
        ),
        HelpItem(
          question: "Why don't I see a provider on my balance screen?",
          answer:
              'Only providers with a SIM actually detected in the phone are shown. If a provider is missing, check that its SIM is inserted.',
        ),
      ]),
  const HelpSection(title: 'Transaction History', icon: Icons.history, items: [
    HelpItem(
      question: 'What can I filter by?',
      answer:
          'Type, Provider (only SIMs detected in the phone), Branch (owners/managers), and — on a phone with two SIMs on the same network — which physical SIM performed the transaction.',
    ),
    HelpItem(
      question: 'How do I sort the list?',
      answer:
          'Tap the sort icon at the top of the screen — choose Date, Amount, Commission, or Recorded Network Charge, ascending or descending.',
    ),
  ]),
  const HelpSection(
      title: 'Reports',
      icon: Icons.receipt_long_outlined,
      items: [
        HelpItem(
          question: 'What reports are available?',
          answer:
              'Business users can download Transaction and Commission Reports as PDF, Excel, or CSV. Personal users can download Transaction Reports as PDF or CSV.',
        ),
        HelpItem(
          question: 'Can I filter a report before generating it?',
          answer:
              'Yes — Period, Type, Provider, SIM (agents only, shown when 2+ SIMs are detected), Status, Agent (owners/managers), Branch, and Sort order, all set before generating. Type, Status, SIM, and Sort only affect the Transaction Report.',
        ),
        HelpItem(
          question: 'Where do I see which SIM performed a transaction?',
          answer:
              "The SIM column shows the last 6 digits of the physical SIM's ID when the device allows it, or falls back to \"Slot 1\"/\"Slot 2\" when it doesn't.",
        ),
      ]),
  const HelpSection(
      title: 'Business Hub',
      icon: Icons.storefront_outlined,
      items: [
        HelpItem(
          question: 'How do I post an ad?',
          answer:
              'Tap "Post Ad" and fill in a title, description, category, price (optional — leave blank for "Contact for price"), location, and contact phone. Add 1 to 3 photos of what you are offering — at least one photo is required. Then submit for review.',
        ),
        HelpItem(
          question: 'What happens after I submit an ad?',
          answer:
              'A superuser reviews it first. Once approved, a small publishing fee is paid via MTN MoMo and the payment reference is submitted. A superuser verifies the payment, and the ad goes live for 30 days.',
        ),
        HelpItem(
          question: "Where do I track my ad's status?",
          answer:
              '"My Ads" shows every ad ever posted, regardless of status — pending review, pending payment, active, rejected, or expired.',
        ),
        HelpItem(
          question: 'Who can see a published ad?',
          answer:
              'Anyone using the app, once it is active — the Business Hub is a shared marketplace across the whole app.',
        ),
      ]),
  const HelpSection(
      title: 'Staff Management (Owners & Managers)',
      icon: Icons.people_outline,
      items: [
        HelpItem(
          question: 'Who can add staff?',
          answer:
              'Owners can add managers, agents, and auditors. Managers can also add agents.',
        ),
        HelpItem(
          question: 'Can staff be moved to a different branch?',
          answer: 'Yes, at any time — branch assignment is never permanent.',
        ),
        HelpItem(
          question: 'What happens when a staff member is deleted?',
          answer:
              'Their transaction history is preserved. If someone with the same email is added again later, their original account and history come back rather than starting over.',
        ),
        HelpItem(
          question: "Where do I see someone's work history?",
          answer:
              'Tap their name in the staff list to see their full transaction history.',
        ),
      ]),
  const HelpSection(
      title: 'Subscription & Billing',
      icon: Icons.card_membership_outlined,
      items: [
        HelpItem(
          question: 'How long is the free trial?',
          answer: '30 days from company approval.',
        ),
        HelpItem(
          question: 'What does it cost after the trial?',
          answer:
              'Business billing is GH₵10 per paid active seat. Every 5th active staff member is free. Personal Paid is GH₵5/month. The Subscription screen shows the amount due before payment.',
        ),
        HelpItem(
          question: 'How is payment confirmed?',
          answer:
              'A superuser verifies each payment before the subscription activates.',
        ),
      ]),
  const HelpSection(
      title: 'Configuring USSD Flows (Owners & Superusers)',
      icon: Icons.settings_suggest_outlined,
      items: [
        HelpItem(
          question: 'Where do I configure a new USSD automation?',
          answer:
              'In the mobile app, Business owners can open More → Custom USSD Flows for company flows. Personal users can open Personal More → Custom USSD Flows for their own flows. Global flows are centrally managed and appear read-only where applicable.',
        ),
        HelpItem(
          question: 'How do I create a new flow?',
          answer:
              'Open Custom USSD Flows and tap +. Choose from the providers and transaction types currently available for your account mode, enter the dial code, then define the flow steps. The available provider and transaction options can change over time.',
        ),
        HelpItem(
          question: 'What goes in the Flow JSON?',
          answer:
              'Three parts: success_markers (text snippets meaning the transaction succeeded), failure_markers (text snippets meaning it failed), and steps — the ordered list of what to do at each USSD screen.',
        ),
        HelpItem(
          question: 'How does a step work?',
          answer:
              'Each step has match_all — an array of lowercase text snippets; the step only fires once every one of them appears on the current USSD screen — plus an action (what to do), and sometimes an action_value.',
        ),
        HelpItem(
          question: 'What actions can a step use?',
          answer:
              'send_digit / send_literal — types a fixed value from action_value (e.g. a menu number). send_customer_phone, send_amount, send_operator_id, send_reference, send_merchant_id — automatically types that value from the transaction itself, no action_value needed. auto_confirm_once — sends a fixed action_value exactly once, right after the PIN. pin_prompt — stops automation completely and hands the screen to the agent for real PIN entry.',
        ),
        HelpItem(
          question: 'What does a flow need to save successfully?',
          answer:
              'At least one step. Every step needs a non-empty match_all. Every flow needs at least one pin_prompt step — this is a hard requirement, not optional, since without it the app will never pause for real PIN entry.',
        ),
        HelpItem(
          question: 'How do I test a flow before trusting it live?',
          answer:
              'Open the flow and scroll to "Test a Screen" at the bottom of the edit window. Paste real USSD screen text (e.g. copied from a screenshot) and tap Simulate — it shows exactly which step would fire, using the same matching logic the app itself uses.',
        ),
        HelpItem(
          question: 'Is it safe to just save and see what happens?',
          answer:
              'No — always verify a new or edited flow against a real device before trusting it live. Wrong match_all text or markers can leave a transaction hanging indefinitely.',
        ),
      ]),
  const HelpSection(
      title: 'Support & Troubleshooting',
      icon: Icons.support_agent_outlined,
      items: [
        HelpItem(
          question: 'How do I reach my network for account or PIN issues?',
          answer:
              'MTN Personal users call 100. MTN Agent SIM users call 114. Telecel users call 100. AT Money users call 100.',
        ),
        HelpItem(
          question: 'How do I reach Agent Pro Ghana support?',
          answer:
              'Email support@agentproghana.com, call 0207438990, or message on WhatsApp — all available from the Support screen.',
        ),
        HelpItem(
          question: 'What are the support hours?',
          answer: 'Monday to Friday, 8:00 AM to 5:00 PM.',
        ),
      ]),
  const HelpSection(
      title: 'Account & Security',
      icon: Icons.lock_outline,
      items: [
        HelpItem(
          question: 'How does phone authentication work?',
          answer:
              'Enable phone authentication in Settings when it is available on your device. It unlocks a resumable AgentPro session using the device authentication method supported by your phone.',
        ),
        HelpItem(
          question: 'I forgot my password.',
          answer: 'Use "Forgot Password" from the login screen.',
        ),
      ]),
];

class HelpGuideScreen extends StatefulWidget {
  const HelpGuideScreen({super.key});
  @override
  State<HelpGuideScreen> createState() => _HelpGuideScreenState();
}

class _HelpGuideScreenState extends State<HelpGuideScreen> {
  final _searchCtrl = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  bool _matches(HelpItem item) {
    if (_query.isEmpty) return true;
    final q = _query.toLowerCase();
    return item.question.toLowerCase().contains(q) ||
        item.answer.toLowerCase().contains(q);
  }

  @override
  Widget build(BuildContext context) {
    final visibleSections = _helpSections
        .map((s) => MapEntry(s, s.items.where(_matches).toList()))
        .where((e) => e.value.isNotEmpty)
        .toList();

    return Scaffold(
      appBar: AppBar(title: const Text('How to Use the App')),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: TextField(
            controller: _searchCtrl,
            onChanged: (v) => setState(() => _query = v),
            decoration: InputDecoration(
              hintText: 'Search the help guide...',
              prefixIcon: const Icon(Icons.search),
              suffixIcon: _query.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.clear),
                      onPressed: () {
                        _searchCtrl.clear();
                        setState(() => _query = '');
                      })
                  : null,
              border:
                  OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              isDense: true,
            ),
          ),
        ),
        Expanded(
          child: visibleSections.isEmpty
              ? Center(
                  child: Text('No results for "$_query"',
                      style: TextStyle(color: context.appSecondaryText)))
              : ListView.builder(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  itemCount: visibleSections.length,
                  itemBuilder: (_, i) {
                    final section = visibleSections[i].key;
                    final items = visibleSections[i].value;
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Container(
                        decoration: BoxDecoration(
                          color: context.appSurface,
                          borderRadius: BorderRadius.circular(14),
                          boxShadow: [
                            BoxShadow(
                                color: Colors.black.withValues(alpha: 0.06),
                                blurRadius: 4)
                          ],
                        ),
                        child: Theme(
                          data: Theme.of(context)
                              .copyWith(dividerColor: Colors.transparent),
                          child: ExpansionTile(
                            leading: Icon(section.icon,
                                color: AppTheme.primaryColor),
                            title: Text(section.title,
                                style: const TextStyle(
                                    fontWeight: FontWeight.bold, fontSize: 14)),
                            initiallyExpanded: _query.isNotEmpty,
                            children: [
                              for (final item in items)
                                Padding(
                                  padding: const EdgeInsets.only(
                                      left: 8, right: 8, bottom: 4),
                                  child: ExpansionTile(
                                    title: Text(item.question,
                                        style: const TextStyle(
                                            fontWeight: FontWeight.w600,
                                            fontSize: 13)),
                                    initiallyExpanded: _query.isNotEmpty,
                                    children: [
                                      Padding(
                                        padding: const EdgeInsets.fromLTRB(
                                            4, 0, 4, 12),
                                        child: Text(item.answer,
                                            style: TextStyle(
                                                fontSize: 12.5,
                                                color: context.appSecondaryText,
                                                height: 1.4)),
                                      ),
                                    ],
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                ),
        ),
      ]),
    );
  }
}
