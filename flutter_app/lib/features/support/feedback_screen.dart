import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/constants/app_constants.dart';
import '../../shared/theme/app_theme.dart';

class FeedbackScreen extends StatefulWidget {
  const FeedbackScreen({super.key});

  @override
  State<FeedbackScreen> createState() =>
      _FeedbackScreenState();
}

class _FeedbackScreenState
    extends State<FeedbackScreen> {
  final _formKey =
      GlobalKey<FormState>();

  final _subjectController =
      TextEditingController();

  final _messageController =
      TextEditingController();

  String _type = 'Feedback';
  bool _sending = false;

  Future<void> _send() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    setState(() => _sending = true);

    final subject =
        _subjectController.text.trim();

    final message =
        _messageController.text.trim();

    final uri = Uri(
      scheme: 'mailto',
      path:
          AppConstants.supportEmail,
      queryParameters: {
        'subject':
            'AgentPro $_type: $subject',
        'body': message,
      },
    );

    var launched = false;

    try {
      launched = await launchUrl(
        uri,
        mode:
            LaunchMode.externalApplication,
      );
    } catch (_) {
      launched = false;
    }

    if (!mounted) return;

    setState(() => _sending = false);

    if (!launched) {
      ScaffoldMessenger.of(context)
          .showSnackBar(
        const SnackBar(
          content: Text(
            'Your email app could not be opened. '
            'Please email '
            '${AppConstants.supportEmail}.',
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title:
            const Text(
          'Complaints & Feedback',
        ),
      ),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding:
                const EdgeInsets.all(16),
            children: [
              const Text(
                'Tell us what happened or how AgentPro can improve.',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight:
                      FontWeight.w700,
                ),
              ),
              const SizedBox(height: 6),
              const Text(
                'AgentPro does not automatically attach transaction '
                'details, phone numbers, PINs or USSD screen content.',
              ),
              const SizedBox(height: 20),
              DropdownButtonFormField<String>(
                initialValue: _type,
                decoration:
                    const InputDecoration(
                  labelText: 'Type',
                  border:
                      OutlineInputBorder(),
                ),
                items: const [
                  DropdownMenuItem(
                    value: 'Complaint',
                    child:
                        Text('Complaint'),
                  ),
                  DropdownMenuItem(
                    value: 'Feedback',
                    child:
                        Text('Feedback'),
                  ),
                  DropdownMenuItem(
                    value: 'Suggestion',
                    child:
                        Text('Suggestion'),
                  ),
                ],
                onChanged: _sending
                    ? null
                    : (value) {
                        if (value !=
                            null) {
                          setState(
                            () => _type =
                                value,
                          );
                        }
                      },
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller:
                    _subjectController,
                maxLength: 120,
                decoration:
                    const InputDecoration(
                  labelText: 'Subject',
                  border:
                      OutlineInputBorder(),
                ),
                validator: (value) {
                  if (value == null ||
                      value.trim().isEmpty) {
                    return 'Enter a subject';
                  }

                  return null;
                },
              ),
              const SizedBox(height: 10),
              TextFormField(
                controller:
                    _messageController,
                minLines: 6,
                maxLines: 10,
                maxLength: 2000,
                decoration:
                    const InputDecoration(
                  labelText:
                      'Complaint or feedback',
                  alignLabelWithHint:
                      true,
                  border:
                      OutlineInputBorder(),
                ),
                validator: (value) {
                  if (value == null ||
                      value.trim().length <
                          10) {
                    return 'Please provide a little more detail';
                  }

                  return null;
                },
              ),
              const SizedBox(height: 16),
              FilledButton.icon(
                onPressed:
                    _sending ? null : _send,
                icon: _sending
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child:
                            CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(
                        Icons.send_outlined,
                      ),
                label: Text(
                  _sending
                      ? 'Opening email...'
                      : 'Send',
                ),
                style:
                    FilledButton.styleFrom(
                  backgroundColor:
                      AppTheme.primaryColor,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  void dispose() {
    _subjectController.dispose();
    _messageController.dispose();
    super.dispose();
  }
}
