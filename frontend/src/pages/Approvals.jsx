import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Chip,
  Avatar,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Grid,
  Paper,
  Divider,
  Alert,
  CircularProgress,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  CheckCircle,
  Cancel,
  Visibility,
  AttachMoney,
  Receipt,
  Person,
  Business,
  CalendarToday,
  Comment,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import axios from 'axios';

const Approvals = () => {
  const [pendingExpenses, setPendingExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedExpense, setSelectedExpense] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [actionType, setActionType] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { enqueueSnackbar } = useSnackbar();

  // Fetch pending expenses
  const fetchPendingExpenses = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/admin/expenses/pending');
      setPendingExpenses(response.data.data.expenses);
    } catch (error) {
      enqueueSnackbar('Failed to fetch pending expenses', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingExpenses();
  }, []);

  const handleAction = (expense, action) => {
    setSelectedExpense(expense);
    setActionType(action);
    setNotes('');
    setDialogOpen(true);
  };

  const handleSubmitAction = async () => {
    if (!selectedExpense || !actionType) return;

    try {
      setSubmitting(true);
      
      const endpoint = `/api/admin/expenses/${selectedExpense.id}/${actionType}`;
      const payload = actionType === 'approve' 
        ? { notes } 
        : actionType === 'reject' 
          ? { reason: notes }
          : { message: notes };

      await axios.post(endpoint, payload);

      enqueueSnackbar(
        `Expense ${actionType}d successfully`, 
        { variant: 'success' }
      );

      // Remove the expense from the list
      setPendingExpenses(prev => 
        prev.filter(expense => expense.id !== selectedExpense.id)
      );

      setDialogOpen(false);
      setSelectedExpense(null);
      setActionType('');
      setNotes('');
    } catch (error) {
      enqueueSnackbar(
        error.response?.data?.message || `Failed to ${actionType} expense`, 
        { variant: 'error' }
      );
    } finally {
      setSubmitting(false);
    }
  };

  const getActionColor = (action) => {
    switch (action) {
      case 'approve':
        return 'success';
      case 'reject':
        return 'error';
      case 'request-changes':
        return 'warning';
      default:
        return 'primary';
    }
  };

  const getActionIcon = (action) => {
    switch (action) {
      case 'approve':
        return <CheckCircle />;
      case 'reject':
        return <Cancel />;
      case 'request-changes':
        return <Comment />;
      default:
        return <Visibility />;
    }
  };

  const formatCurrency = (amount, currency = 'BRL') => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box mb={3}>
        <Typography variant="h4" gutterBottom>
          Pending Approvals
        </Typography>
        <Typography variant="body1" color="textSecondary">
          Review and approve expense submissions
        </Typography>
      </Box>

      {pendingExpenses.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Receipt sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" gutterBottom>
            No Pending Approvals
          </Typography>
          <Typography color="textSecondary">
            All expenses have been processed. Great job!
          </Typography>
        </Paper>
      ) : (
        <Grid container spacing={3}>
          {pendingExpenses.map((expense) => (
            <Grid item xs={12} key={expense.id}>
              <Card>
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                    <Box flex={1}>
                      <Box display="flex" alignItems="center" mb={2}>
                        <Avatar sx={{ bgcolor: 'primary.main', mr: 2 }}>
                          <Person />
                        </Avatar>
                        <Box>
                          <Typography variant="h6" component="div">
                            {expense.title}
                          </Typography>
                          <Typography variant="body2" color="textSecondary">
                            Submitted by {expense.user_name} ({expense.user_email})
                          </Typography>
                        </Box>
                      </Box>

                      <Grid container spacing={2} mb={2}>
                        <Grid item xs={12} sm={6} md={3}>
                          <Box display="flex" alignItems="center">
                            <AttachMoney sx={{ mr: 1, color: 'success.main' }} />
                            <Box>
                              <Typography variant="body2" color="textSecondary">
                                Amount
                              </Typography>
                              <Typography variant="h6">
                                {formatCurrency(expense.amount, expense.currency)}
                              </Typography>
                            </Box>
                          </Box>
                        </Grid>

                        <Grid item xs={12} sm={6} md={3}>
                          <Box display="flex" alignItems="center">
                            <CalendarToday sx={{ mr: 1, color: 'info.main' }} />
                            <Box>
                              <Typography variant="body2" color="textSecondary">
                                Expense Date
                              </Typography>
                              <Typography variant="body1">
                                {formatDate(expense.expense_date)}
                              </Typography>
                            </Box>
                          </Box>
                        </Grid>

                        <Grid item xs={12} sm={6} md={3}>
                          <Box display="flex" alignItems="center">
                            <Business sx={{ mr: 1, color: 'warning.main' }} />
                            <Box>
                              <Typography variant="body2" color="textSecondary">
                                Vendor
                              </Typography>
                              <Typography variant="body1">
                                {expense.vendor || 'Not specified'}
                              </Typography>
                            </Box>
                          </Box>
                        </Grid>

                        <Grid item xs={12} sm={6} md={3}>
                          <Box>
                            <Typography variant="body2" color="textSecondary" mb={1}>
                              Category
                            </Typography>
                            <Chip 
                              label={expense.category} 
                              size="small" 
                              variant="outlined"
                              color="primary"
                            />
                          </Box>
                        </Grid>
                      </Grid>

                      {expense.description && (
                        <Box mb={2}>
                          <Typography variant="body2" color="textSecondary" gutterBottom>
                            Description
                          </Typography>
                          <Typography variant="body1">
                            {expense.description}
                          </Typography>
                        </Box>
                      )}

                      {expense.user_department && (
                        <Typography variant="body2" color="textSecondary">
                          Department: {expense.user_department}
                        </Typography>
                      )}
                    </Box>

                    <Box display="flex" flexDirection="column" gap={1} ml={2}>
                      <Button
                        variant="contained"
                        color="success"
                        startIcon={<CheckCircle />}
                        onClick={() => handleAction(expense, 'approve')}
                        size="small"
                      >
                        Approve
                      </Button>
                      
                      <Button
                        variant="contained"
                        color="error"
                        startIcon={<Cancel />}
                        onClick={() => handleAction(expense, 'reject')}
                        size="small"
                      >
                        Reject
                      </Button>
                      
                      <Button
                        variant="outlined"
                        color="warning"
                        startIcon={<Comment />}
                        onClick={() => handleAction(expense, 'request-changes')}
                        size="small"
                      >
                        Request Changes
                      </Button>

                      {expense.receipt_url && (
                        <Tooltip title="View Receipt">
                          <IconButton
                            color="primary"
                            onClick={() => window.open(expense.receipt_url, '_blank')}
                          >
                            <Receipt />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Action Dialog */}
      <Dialog 
        open={dialogOpen} 
        onClose={() => setDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" alignItems="center">
            {getActionIcon(actionType)}
            <Typography variant="h6" sx={{ ml: 1 }}>
              {actionType === 'approve' && 'Approve Expense'}
              {actionType === 'reject' && 'Reject Expense'}
              {actionType === 'request-changes' && 'Request Changes'}
            </Typography>
          </Box>
        </DialogTitle>
        
        <DialogContent>
          {selectedExpense && (
            <Box mb={3}>
              <Typography variant="subtitle1" gutterBottom>
                {selectedExpense.title}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                {formatCurrency(selectedExpense.amount, selectedExpense.currency)} • {selectedExpense.user_name}
              </Typography>
            </Box>
          )}

          <TextField
            fullWidth
            multiline
            rows={4}
            label={
              actionType === 'approve' 
                ? 'Approval Notes (Optional)' 
                : actionType === 'reject'
                  ? 'Rejection Reason (Required)'
                  : 'Change Request Message (Required)'
            }
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            required={actionType !== 'approve'}
            placeholder={
              actionType === 'approve'
                ? 'Add any notes for this approval...'
                : actionType === 'reject'
                  ? 'Please explain why this expense is being rejected...'
                  : 'Please specify what changes are needed...'
            }
          />

          {actionType === 'reject' && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              This expense will be marked as rejected and the employee will be notified.
            </Alert>
          )}
        </DialogContent>

        <DialogActions>
          <Button 
            onClick={() => setDialogOpen(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmitAction}
            variant="contained"
            color={getActionColor(actionType)}
            disabled={submitting || (actionType !== 'approve' && !notes.trim())}
            startIcon={submitting ? <CircularProgress size={20} /> : getActionIcon(actionType)}
          >
            {submitting ? 'Processing...' : 
              actionType === 'approve' ? 'Approve' :
              actionType === 'reject' ? 'Reject' :
              'Request Changes'
            }
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Approvals;