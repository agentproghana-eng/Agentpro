import 'package:dio/dio.dart';
import 'package:flutter/material.dart';

import '../../core/api/api_client.dart';
import '../../shared/theme/app_theme.dart';

class FeedbackScreen extends StatefulWidget {
  const FeedbackScreen({super.key});

  @override
  State<FeedbackScreen> createState() =>
      _FeedbackScreenState();
}

class _FeedbackScreenState extends State<FeedbackScreen> {
  final _formKey = GlobalKey<FormState>();
  final _subjectController = TextEditingController();
  final _messageController = TextEditingController();

  String _type = 'feedback';
  bool _sending = false;

  String _typeLabel(String value) => switch (value) {
        'complaint' => 'Complaint',
        'suggestion' => 'Suggestion',
        _ => 'Feedback',
      };

  Future<void> _send() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    setState(() => _sending = true);

    try {
      final response = await ApiClient.instance.post(
        '/support/cases',
        data: {
          'type': _type,
          'subject': _subjectController.text.trim(),
          'message': _messageController.text.trim(),
        },
      );

      final payload = response.data;
      String reference = 'your support case';

      if (payload is Map) {
        final data = payload['data'];

        if (data is Map) {
          final raw = data['reference']?.toString().trim();

          if (raw != null && raw.isNotEmpty) {
            reference = raw;
          }
        }
      }

      _subjectController.clear();
      _messageController.clear();

      if (!mounted) return;

      setState(() => _type = 'feedback');

      await showDialog<void>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          icon: const Icon(
            Icons.check_circle_outline,
            color: AppTheme.primaryColor,
          ),
          title: const Text('Message received'),
          content: Text(
            'AgentPro Support has received your message. '
            'Reference: $reference',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('Done'),
            ),
          ],
        ),
      );
    } catch (error) {
      if (!mounted) return;

      var message =
          'Your message could not be sent. Please try again.';

      if (error is DioException) {
        final body = error.response?.data;

        if (body is Map) {
          final serverMessage = body['message']?.toString().trim();

          if (serverMessage != null && serverMessage.isNotEmpty) {
            message = serverMessage;
          }
        }
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(message)),
      );
    } finally {
      if (mounted) {
        setState(() => _sending = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Complaints & Feedback'),
      ),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              const Text(
                'Tell us what happened or how AgentPro can improve.',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 6),
              const Text(
                'Your message is sent securely to AgentPro Support. '
                'Do not include your PIN, password or one-time codes. '
                'AgentPro does not automatically attach transaction '
                'details, phone numbers, PINs or USSD screen content.',
              ),
              const SizedBox(height: 20),
              DropdownButtonFormField<String>(
                initialValue: _type,
                decoration: const InputDecoration(
                  labelText: 'Type',
                  border: OutlineInputBorder(),
                ),
                items: const [
                  DropdownMenuItem(
                    value: 'complaint',
                    child: Text('Complaint'),
                  ),
                  DropdownMenuItem(
                    value: 'feedback',
                    child: Text('Feedback'),
                  ),
                  DropdownMenuItem(
                    value: 'suggestion',
                    child: Text('Suggestion'),
                  ),
                ],
                onChanged: _sending
                    ? null
                    : (value) {
                        if (value != null) {
                          setState(() => _type = value);
                        }
                      },
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _subjectController,
                maxLength: 120,
                textInputAction: TextInputAction.next,
                decoration: InputDecoration(
                  labelText: '${_typeLabel(_type)} subject',
                  border: const OutlineInputBorder(),
                ),
                validator: (value) {
                  if ((value?.trim().length ?? 0) < 3) {
                    return 'Enter a short subject';
                  }

                  return null;
                },
              ),
              const SizedBox(height: 10),
              TextFormField(
                controller: _messageController,
                minLines: 6,
                maxLines: 10,
                maxLength: 4000,
                decoration: InputDecoration(
                  labelText: _typeLabel(_type),
                  alignLabelWithHint: true,
                  border: const OutlineInputBorder(),
                ),
                validator: (value) {
                  if (value == null || value.trim().length < 10) {
                    return 'Please provide a little more detail';
                  }

                  return null;
                },
              ),
              const SizedBox(height: 16),
              FilledButton.icon(
                onPressed: _sending ? null : _send,
                icon: _sending
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(Icons.send_outlined),
                label: Text(
                  _sending ? 'Sending...' : 'Send securely',
                ),
                style: FilledButton.styleFrom(
                  backgroundColor: AppTheme.primaryColor,
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
