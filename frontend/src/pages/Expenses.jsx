import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
  Grid,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  Tooltip,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  Add,
  Visibility,
  Edit,
  Delete,
  FilterList,
  Receipt,
  AttachMoney,
  CheckCircle,
  Cancel,
  Pending,
  Schedule,
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { useSnackbar } from 'notistack';
import axios from 'axios';

const Expenses = () => {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalExpenses, setTotalExpenses] = useState(0);
  
  // Filters
  const [filters, setFilters] = useState({
    status: '',
    category: '',
    startDate: null,
    endDate: null,
    minAmount: '',
    maxAmount: '',
  });

  const statusOptions = [
    { value: '', label: 'All Statuses' },
    { value: 'draft', label: 'Draft' },
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'reimbursed', label: 'Reimbursed' },
    { value: 'changes_requested', label: 'Changes Requested' },
  ];

  const categoryOptions = [
    { value: '', label: 'All Categories' },
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

  // Fetch expenses
  const fetchExpenses = async () => {
    try {
      setLoading(true);
      
      const params = new URLSearchParams({
        page: page + 1,
        limit: rowsPerPage,
        sortBy: 'created_at',
        sortOrder: 'desc',
      });

      // Add filters
      Object.entries(filters).forEach(([key, value]) => {
        if (value && value !== '') {
          if (key === 'startDate' || key === 'endDate') {
            params.append(key, value.toISOString().split('T')[0]);
          } else {
            params.append(key, value);
          }
        }
      });

      const response = await axios.get(`/api/expenses?${params}`);
      setExpenses(response.data.data.expenses);
      setTotalExpenses(response.data.data.pagination.total);
    } catch (error) {
      enqueueSnackbar('Failed to fetch expenses', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, [page, rowsPerPage, filters]);

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
    setPage(0); // Reset to first page when filtering
  };

  const clearFilters = () => {
    setFilters({
      status: '',
      category: '',
      startDate: null,
      endDate: null,
      minAmount: '',
      maxAmount: '',
    });
    setPage(0);
  };

  const handleDeleteExpense = async (expenseId) => {
    if (!window.confirm('Are you sure you want to delete this expense?')) {
      return;
    }

    try {
      await axios.delete(`/api/expenses/${expenseId}`);
      enqueueSnackbar('Expense deleted successfully', { variant: 'success' });
      fetchExpenses();
    } catch (error) {
      enqueueSnackbar(
        error.response?.data?.message || 'Failed to delete expense',
        { variant: 'error' }
      );
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'approved':
        return 'success';
      case 'pending':
        return 'warning';
      case 'rejected':
        return 'error';
      case 'reimbursed':
        return 'info';
      case 'changes_requested':
        return 'secondary';
      case 'draft':
        return 'default';
      default:
        return 'default';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'approved':
        return <CheckCircle fontSize="small" />;
      case 'pending':
        return <Pending fontSize="small" />;
      case 'rejected':
        return <Cancel fontSize="small" />;
      case 'reimbursed':
        return <AttachMoney fontSize="small" />;
      case 'changes_requested':
        return <Schedule fontSize="small" />;
      case 'draft':
        return <Edit fontSize="small" />;
      default:
        return <Receipt fontSize="small" />;
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

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
          <Box>
            <Typography variant="h4" gutterBottom>
              My Expenses
            </Typography>
            <Typography variant="body1" color="textSecondary">
              Manage your expense submissions
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => navigate('/expenses/new')}
          >
            New Expense
          </Button>
        </Box>

        {/* Filters */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Box display="flex" alignItems="center" mb={2}>
              <FilterList sx={{ mr: 1 }} />
              <Typography variant="h6">Filters</Typography>
            </Box>
            
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={2}>
                <FormControl fullWidth size="small">
                  <InputLabel>Status</InputLabel>
                  <Select
                    value={filters.status}
                    label="Status"
                    onChange={(e) => handleFilterChange('status', e.target.value)}
                  >
                    {statusOptions.map(option => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={6} md={2}>
                <FormControl fullWidth size="small">
                  <InputLabel>Category</InputLabel>
                  <Select
                    value={filters.category}
                    label="Category"
                    onChange={(e) => handleFilterChange('category', e.target.value)}
                  >
                    {categoryOptions.map(option => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={6} md={2}>
                <DatePicker
                  label="Start Date"
                  value={filters.startDate}
                  onChange={(date) => handleFilterChange('startDate', date)}
                  slotProps={{ textField: { size: 'small', fullWidth: true } }}
                />
              </Grid>

              <Grid item xs={12} sm={6} md={2}>
                <DatePicker
                  label="End Date"
                  value={filters.endDate}
                  onChange={(date) => handleFilterChange('endDate', date)}
                  slotProps={{ textField: { size: 'small', fullWidth: true } }}
                />
              </Grid>

              <Grid item xs={12} sm={6} md={2}>
                <TextField
                  fullWidth
                  size="small"
                  label="Min Amount"
                  type="number"
                  value={filters.minAmount}
                  onChange={(e) => handleFilterChange('minAmount', e.target.value)}
                />
              </Grid>

              <Grid item xs={12} sm={6} md={2}>
                <TextField
                  fullWidth
                  size="small"
                  label="Max Amount"
                  type="number"
                  value={filters.maxAmount}
                  onChange={(e) => handleFilterChange('maxAmount', e.target.value)}
                />
              </Grid>
            </Grid>

            <Box mt={2}>
              <Button onClick={clearFilters} size="small">
                Clear Filters
              </Button>
            </Box>
          </CardContent>
        </Card>

        {/* Expenses Table */}
        <Card>
          {loading ? (
            <Box display="flex" justifyContent="center" p={4}>
              <CircularProgress />
            </Box>
          ) : expenses.length === 0 ? (
            <Box textAlign="center" p={4}>
              <Receipt sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
              <Typography variant="h6" gutterBottom>
                No Expenses Found
              </Typography>
              <Typography color="textSecondary" paragraph>
                {Object.values(filters).some(f => f && f !== '') 
                  ? 'Try adjusting your filters or create your first expense.'
                  : 'You haven\'t created any expenses yet. Get started by submitting your first expense!'
                }
              </Typography>
              <Button
                variant="contained"
                startIcon={<Add />}
                onClick={() => navigate('/expenses/new')}
              >
                Create First Expense
              </Button>
            </Box>
          ) : (
            <>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Title</TableCell>
                      <TableCell>Amount</TableCell>
                      <TableCell>Category</TableCell>
                      <TableCell>Date</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {expenses.map((expense) => (
                      <TableRow key={expense.id} hover>
                        <TableCell>
                          <Box>
                            <Typography variant="subtitle2">
                              {expense.title}
                            </Typography>
                            {expense.vendor && (
                              <Typography variant="caption" color="textSecondary">
                                {expense.vendor}
                              </Typography>
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight="medium">
                            {formatCurrency(expense.amount, expense.currency)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip 
                            label={expense.category} 
                            size="small" 
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>
                          {formatDate(expense.expense_date)}
                        </TableCell>
                        <TableCell>
                          <Chip
                            icon={getStatusIcon(expense.status)}
                            label={expense.status.replace('_', ' ')}
                            size="small"
                            color={getStatusColor(expense.status)}
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>
                          <Box display="flex" gap={0.5}>
                            <Tooltip title="View Details">
                              <IconButton
                                size="small"
                                onClick={() => navigate(`/expenses/${expense.id}`)}
                              >
                                <Visibility fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            
                            {expense.status === 'draft' && (
                              <>
                                <Tooltip title="Edit">
                                  <IconButton
                                    size="small"
                                    onClick={() => navigate(`/expenses/${expense.id}/edit`)}
                                  >
                                    <Edit fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                
                                <Tooltip title="Delete">
                                  <IconButton
                                    size="small"
                                    color="error"
                                    onClick={() => handleDeleteExpense(expense.id)}
                                  >
                                    <Delete fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </>
                            )}
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              
              <TablePagination
                component="div"
                count={totalExpenses}
                page={page}
                onPageChange={(e, newPage) => setPage(newPage)}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={(e) => {
                  setRowsPerPage(parseInt(e.target.value, 10));
                  setPage(0);
                }}
                rowsPerPageOptions={[5, 10, 25, 50]}
              />
            </>
          )}
        </Card>
      </Box>
    </LocalizationProvider>
  );
};

export default Expenses;