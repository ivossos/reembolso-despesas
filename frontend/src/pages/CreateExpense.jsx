import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  Paper,
  IconButton,
} from '@mui/material';
import {
  CloudUpload,
  Delete,
  Receipt,
  Save,
  Send,
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { useFormik } from 'formik';
import * as yup from 'yup';
import { useSnackbar } from 'notistack';
import axios from 'axios';

const validationSchema = yup.object({
  title: yup.string().required('Title is required').max(255, 'Title too long'),
  amount: yup.number().required('Amount is required').min(0.01, 'Amount must be greater than 0'),
  expenseDate: yup.date().required('Expense date is required').max(new Date(), 'Date cannot be in the future'),
  category: yup.string().required('Category is required'),
  vendor: yup.string().max(255, 'Vendor name too long'),
  description: yup.string().max(1000, 'Description too long'),
});

const CreateExpense = () => {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  
  const [loading, setLoading] = useState(false);
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState(null);

  const categoryOptions = [
    { value: 'meals', label: 'Meals' },
    { value: 'transportation', label: 'Transportation' },
    { value: 'accommodation', label: 'Accommodation' },
    { value: 'office_supplies', label: 'Office Supplies' },
    { value: 'software', label: 'Software' },
    { value: 'training', label: 'Training' },
    { value: 'marketing', label: 'Marketing' },
    { value: 'travel', label: 'Travel' },
    { value: 'other', label: 'Other' },
  ];

  const formik = useFormik({
    initialValues: {
      title: '',
      description: '',
      amount: '',
      currency: 'BRL',
      expenseDate: new Date(),
      vendor: '',
      category: '',
    },
    validationSchema,
    onSubmit: async (values, { setSubmitting }) => {
      await handleSubmit(values, false);
      setSubmitting(false);
    },
  });

  const [ocrProcessing, setOcrProcessing] = useState(false);
  const [ocrData, setOcrData] = useState(null);

  const handleFileChange = async (event) => {
    const file = event.target.files[0];
    if (file) {
      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
      if (!allowedTypes.includes(file.type)) {
        enqueueSnackbar('Only JPEG, PNG, and PDF files are allowed', { variant: 'error' });
        return;
      }

      // Validate file size (10MB)
      if (file.size > 10 * 1024 * 1024) {
        enqueueSnackbar('File size must be less than 10MB', { variant: 'error' });
        return;
      }

      setReceiptFile(file);

      // Create preview for images
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => setReceiptPreview(e.target.result);
        reader.readAsDataURL(file);
      } else {
        setReceiptPreview(null);
      }

      // Process OCR immediately for auto-population
      if (file.type.startsWith('image/')) {
        await processReceiptOCR(file);
      }
    }
  };

  const processReceiptOCR = async (file) => {
    try {
      setOcrProcessing(true);
      enqueueSnackbar('Processing receipt with OCR...', { variant: 'info' });

      // Create a temporary FormData to send just the receipt for OCR
      const formData = new FormData();
      formData.append('receipt', file);

      // Call OCR processing endpoint
      const response = await axios.post('/api/expenses/ocr-process', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const ocrResult = response.data.data;
      setOcrData(ocrResult);

      // Auto-populate form fields with OCR data
      if (ocrResult.keyValuePairs) {
        const updates = {};
        
        if (ocrResult.keyValuePairs.vendor) {
          updates.vendor = ocrResult.keyValuePairs.vendor;
        }
        if (ocrResult.keyValuePairs.amount) {
          updates.amount = parseFloat(ocrResult.keyValuePairs.amount) || '';
        }
        if (ocrResult.keyValuePairs.date) {
          updates.expenseDate = new Date(ocrResult.keyValuePairs.date);
        }

        // Update form values
        formik.setValues(prev => ({ ...prev, ...updates }));
      }

      // Auto-suggest category based on ML
      if (ocrResult.suggestedCategory) {
        formik.setFieldValue('category', ocrResult.suggestedCategory);
      }

      enqueueSnackbar('Receipt processed successfully! Form fields auto-populated.', { variant: 'success' });
    } catch (error) {
      console.error('OCR processing failed:', error);
      enqueueSnackbar('OCR processing failed, but you can still fill the form manually', { variant: 'warning' });
    } finally {
      setOcrProcessing(false);
    }
  };

  const handleRemoveReceipt = () => {
    setReceiptFile(null);
    setReceiptPreview(null);
  };

  const handleSubmit = async (values, isDraft = false) => {
    try {
      setLoading(true);

      const formData = new FormData();
      formData.append('title', values.title);
      formData.append('description', values.description);
      formData.append('amount', values.amount);
      formData.append('currency', values.currency);
      formData.append('expenseDate', values.expenseDate.toISOString().split('T')[0]);
      formData.append('vendor', values.vendor);
      formData.append('category', values.category);
      
      if (receiptFile) {
        formData.append('receipt', receiptFile);
      }

      const response = await axios.post('/api/expenses', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const expenseId = response.data.data.expense.id;

      if (!isDraft) {
        // Submit for approval
        await axios.post(`/api/expenses/${expenseId}/submit`);
        enqueueSnackbar('Expense submitted for approval successfully!', { variant: 'success' });
      } else {
        enqueueSnackbar('Expense saved as draft successfully!', { variant: 'success' });
      }

      navigate('/expenses');
    } catch (error) {
      enqueueSnackbar(
        error.response?.data?.message || 'Failed to create expense',
        { variant: 'error' }
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAsDraft = async () => {
    // Validate required fields for draft (less strict)
    if (!formik.values.title || !formik.values.amount || !formik.values.expenseDate || !formik.values.category) {
      enqueueSnackbar('Please fill in title, amount, date, and category to save as draft', { variant: 'warning' });
      return;
    }

    await handleSubmit(formik.values, true);
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box>
        <Box mb={3}>
          <Typography variant="h4" gutterBottom>
            Create New Expense
          </Typography>
          <Typography variant="body1" color="textSecondary">
            Submit a new expense for reimbursement
          </Typography>
          {ocrProcessing && (
            <Alert severity="info" sx={{ mt: 2 }}>
              <CircularProgress size={16} sx={{ mr: 1 }} />
              Processing receipt with OCR... This will auto-populate form fields.
            </Alert>
          )}
          {ocrData && (
            <Alert severity="success" sx={{ mt: 2 }}>
              Receipt processed successfully! Form fields have been auto-populated with extracted data.
            </Alert>
          )}
        </Box>

        <form onSubmit={formik.handleSubmit}>
          <Grid container spacing={3}>
            {/* Main Form */}
            <Grid item xs={12} md={8}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Expense Details
                  </Typography>

                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        id="title"
                        name="title"
                        label="Expense Title *"
                        value={formik.values.title}
                        onChange={formik.handleChange}
                        error={formik.touched.title && Boolean(formik.errors.title)}
                        helperText={formik.touched.title && formik.errors.title}
                        placeholder="e.g., Team lunch with client"
                      />
                    </Grid>

                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        id="amount"
                        name="amount"
                        label="Amount *"
                        type="number"
                        inputProps={{ step: "0.01", min: "0" }}
                        value={formik.values.amount}
                        onChange={formik.handleChange}
                        error={formik.touched.amount && Boolean(formik.errors.amount)}
                        helperText={formik.touched.amount && formik.errors.amount}
                      />
                    </Grid>

                    <Grid item xs={12} sm={6}>
                      <FormControl fullWidth>
                        <InputLabel>Currency</InputLabel>
                        <Select
                          id="currency"
                          name="currency"
                          value={formik.values.currency}
                          label="Currency"
                          onChange={formik.handleChange}
                        >
                          <MenuItem value="BRL">BRL (R$)</MenuItem>
                          <MenuItem value="USD">USD ($)</MenuItem>
                          <MenuItem value="EUR">EUR (€)</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>

                    <Grid item xs={12} sm={6}>
                      <DatePicker
                        label="Expense Date *"
                        value={formik.values.expenseDate}
                        onChange={(date) => formik.setFieldValue('expenseDate', date)}
                        maxDate={new Date()}
                        slotProps={{
                          textField: {
                            fullWidth: true,
                            error: formik.touched.expenseDate && Boolean(formik.errors.expenseDate),
                            helperText: formik.touched.expenseDate && formik.errors.expenseDate,
                          },
                        }}
                      />
                    </Grid>

                    <Grid item xs={12} sm={6}>
                      <FormControl fullWidth error={formik.touched.category && Boolean(formik.errors.category)}>
                        <InputLabel>Category *</InputLabel>
                        <Select
                          id="category"
                          name="category"
                          value={formik.values.category}
                          label="Category *"
                          onChange={formik.handleChange}
                        >
                          {categoryOptions.map(option => (
                            <MenuItem key={option.value} value={option.value}>
                              {option.label}
                            </MenuItem>
                          ))}
                        </Select>
                        {formik.touched.category && formik.errors.category && (
                          <Typography variant="caption" color="error" sx={{ mt: 1, ml: 2 }}>
                            {formik.errors.category}
                          </Typography>
                        )}
                      </FormControl>
                    </Grid>

                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        id="vendor"
                        name="vendor"
                        label="Vendor/Merchant"
                        value={formik.values.vendor}
                        onChange={formik.handleChange}
                        error={formik.touched.vendor && Boolean(formik.errors.vendor)}
                        helperText={formik.touched.vendor && formik.errors.vendor}
                        placeholder="e.g., Restaurant ABC, Uber, Amazon"
                      />
                    </Grid>

                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        multiline
                        rows={3}
                        id="description"
                        name="description"
                        label="Description"
                        value={formik.values.description}
                        onChange={formik.handleChange}
                        error={formik.touched.description && Boolean(formik.errors.description)}
                        helperText={formik.touched.description && formik.errors.description}
                        placeholder="Additional details about this expense..."
                      />
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>

            {/* Receipt Upload */}
            <Grid item xs={12} md={4}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Receipt
                  </Typography>

                  {!receiptFile ? (
                    <Paper
                      sx={{
                        border: '2px dashed',
                        borderColor: 'primary.main',
                        borderRadius: 2,
                        p: 3,
                        textAlign: 'center',
                        cursor: 'pointer',
                        '&:hover': {
                          bgcolor: 'action.hover',
                        },
                      }}
                      component="label"
                    >
                      <input
                        type="file"
                        hidden
                        accept="image/*,.pdf"
                        onChange={handleFileChange}
                      />
                      <CloudUpload sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
                      <Typography variant="body1" gutterBottom>
                        Click to upload receipt
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        Supports JPEG, PNG, PDF (max 10MB)
                      </Typography>
                    </Paper>
                  ) : (
                    <Box>
                      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
                        <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                          {receiptFile.name}
                        </Typography>
                        <IconButton size="small" color="error" onClick={handleRemoveReceipt}>
                          <Delete />
                        </IconButton>
                      </Box>
                      
                      {receiptPreview ? (
                        <img
                          src={receiptPreview}
                          alt="Receipt preview"
                          style={{
                            width: '100%',
                            maxHeight: 200,
                            objectFit: 'contain',
                            border: '1px solid #ddd',
                            borderRadius: 4,
                          }}
                        />
                      ) : (
                        <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'grey.100' }}>
                          <Receipt sx={{ fontSize: 48, color: 'grey.500' }} />
                          <Typography variant="body2" color="textSecondary">
                            PDF uploaded
                          </Typography>
                        </Paper>
                      )}
                    </Box>
                  )}

                  <Alert severity="info" sx={{ mt: 2 }}>
                    <Typography variant="caption">
                      Uploading a receipt will automatically extract data using OCR to help fill the form.
                    </Typography>
                  </Alert>
                </CardContent>
              </Card>
            </Grid>

            {/* Actions */}
            <Grid item xs={12}>
              <Box display="flex" gap={2} justifyContent="flex-end">
                <Button
                  variant="outlined"
                  onClick={() => navigate('/expenses')}
                  disabled={loading}
                >
                  Cancel
                </Button>
                
                <Button
                  variant="outlined"
                  startIcon={<Save />}
                  onClick={handleSaveAsDraft}
                  disabled={loading}
                >
                  Save as Draft
                </Button>
                
                <Button
                  type="submit"
                  variant="contained"
                  startIcon={loading ? <CircularProgress size={20} /> : <Send />}
                  disabled={loading}
                >
                  {loading ? 'Submitting...' : 'Submit for Approval'}
                </Button>
              </Box>
            </Grid>
          </Grid>
        </form>
      </Box>
    </LocalizationProvider>
  );
};

export default CreateExpense;