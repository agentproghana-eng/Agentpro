import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../ussd_settings/quick_action_catalog.dart';

class ServerDrivenTransactionForm extends StatefulWidget {
  final List<TransactionFormFieldDefinition> fields;
  final Map<String, String> initialValues;
  final ValueChanged<Map<String, String>> onChanged;

  const ServerDrivenTransactionForm({
    super.key,
    required this.fields,
    required this.onChanged,
    this.initialValues = const <String, String>{},
  });

  @override
  State<ServerDrivenTransactionForm> createState() =>
      ServerDrivenTransactionFormState();
}

class ServerDrivenTransactionFormState
    extends State<ServerDrivenTransactionForm> {
  final Map<String, TextEditingController> _controllers =
      <String, TextEditingController>{};

  final Map<String, String?> _selectionValues =
      <String, String?>{};

  @override
  void initState() {
    super.initState();
    _buildState();
  }

  @override
  void didUpdateWidget(
    covariant ServerDrivenTransactionForm oldWidget,
  ) {
    super.didUpdateWidget(oldWidget);

    if (!_sameFieldIdentity(oldWidget.fields, widget.fields)) {
      _disposeControllers();
      _selectionValues.clear();
      _buildState();
    }
  }

  bool _sameFieldIdentity(
    List<TransactionFormFieldDefinition> a,
    List<TransactionFormFieldDefinition> b,
  ) {
    if (a.length != b.length) return false;

    for (var index = 0; index < a.length; index += 1) {
      if (a[index].key != b[index].key ||
          a[index].type != b[index].type) {
        return false;
      }
    }

    return true;
  }

  void _buildState() {
    for (final field in widget.fields) {
      final initialValue =
          widget.initialValues[field.key]?.trim() ?? '';

      if (field.type == 'selection') {
        final validInitialValue = field.options.any(
          (option) => option.value == initialValue,
        );

        _selectionValues[field.key] =
            validInitialValue ? initialValue : null;
        continue;
      }

      _controllers[field.key] = TextEditingController(
        text: initialValue,
      );
    }
  }

  void _disposeControllers() {
    for (final controller in _controllers.values) {
      controller.dispose();
    }
    _controllers.clear();
  }

  @override
  void dispose() {
    _disposeControllers();
    super.dispose();
  }

  Map<String, String> values() {
    final result = <String, String>{};

    for (final field in widget.fields) {
      if (field.type == 'selection') {
        final value = _selectionValues[field.key]?.trim();
        if (value != null && value.isNotEmpty) {
          result[field.key] = value;
        }
        continue;
      }

      final value = _controllers[field.key]?.text.trim() ?? '';
      if (value.isNotEmpty) {
        result[field.key] = value;
      }
    }

    return Map<String, String>.unmodifiable(result);
  }

  void _emitChanged() {
    widget.onChanged(values());
  }

  TextInputType _keyboardType(
    TransactionFormFieldDefinition field,
  ) {
    return switch (field.type) {
      'phone' => TextInputType.phone,
      'amount' => const TextInputType.numberWithOptions(
          decimal: true,
        ),
      'digits' => TextInputType.number,
      'account_number' => TextInputType.text,
      'operator_id' => TextInputType.text,
      _ => TextInputType.text,
    };
  }

  List<TextInputFormatter> _formatters(
    TransactionFormFieldDefinition field,
  ) {
    final formatters = <TextInputFormatter>[];

    if (field.type == 'phone' ||
        field.type == 'digits') {
      formatters.add(
        FilteringTextInputFormatter.digitsOnly,
      );
    }

    if (field.type == 'amount') {
      formatters.add(
        FilteringTextInputFormatter.allow(
          RegExp(r'^\d*(?:\.\d{0,2})?$'),
        ),
      );
    }

    if (field.maxLength != null) {
      formatters.add(
        LengthLimitingTextInputFormatter(
          field.maxLength,
        ),
      );
    }

    return formatters;
  }

  String? _validateText(
    TransactionFormFieldDefinition field,
    String? rawValue,
  ) {
    final value = rawValue?.trim() ?? '';

    if (field.isRequired && value.isEmpty) {
      return '${field.label} is required';
    }

    if (value.isEmpty) {
      return null;
    }

    if (field.minLength != null &&
        value.length < field.minLength!) {
      return '${field.label} must be at least '
          '${field.minLength} characters';
    }

    if (field.maxLength != null &&
        value.length > field.maxLength!) {
      return '${field.label} must not exceed '
          '${field.maxLength} characters';
    }

    if (field.type == 'amount') {
      final amount = double.tryParse(value);

      if (amount == null || amount <= 0) {
        return 'Enter a valid ${field.label.toLowerCase()}';
      }
    }

    return null;
  }

  Widget _buildSelection(
    TransactionFormFieldDefinition field,
  ) {
    return DropdownButtonFormField<String>(
      value: _selectionValues[field.key],
      decoration: InputDecoration(
        labelText: field.label,
      ),
      items: field.options
          .map(
            (option) => DropdownMenuItem<String>(
              value: option.value,
              child: Text(option.label),
            ),
          )
          .toList(growable: false),
      validator: (value) {
        if (field.isRequired &&
            (value == null || value.trim().isEmpty)) {
          return '${field.label} is required';
        }

        return null;
      },
      onChanged: (value) {
        setState(() {
          _selectionValues[field.key] = value;
        });
        _emitChanged();
      },
    );
  }

  Widget _buildTextField(
    TransactionFormFieldDefinition field,
  ) {
    final controller = _controllers[field.key];

    assert(
      controller != null,
      'Missing controller for ${field.key}',
    );

    return TextFormField(
      controller: controller,
      decoration: InputDecoration(
        labelText: field.label,
      ),
      keyboardType: _keyboardType(field),
      inputFormatters: _formatters(field),
      validator: (value) => _validateText(
        field,
        value,
      ),
      onChanged: (_) => _emitChanged(),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var index = 0;
            index < widget.fields.length;
            index += 1) ...[
          if (index > 0)
            const SizedBox(height: 16),
          widget.fields[index].type == 'selection'
              ? _buildSelection(widget.fields[index])
              : _buildTextField(widget.fields[index]),
        ],
      ],
    );
  }
}
