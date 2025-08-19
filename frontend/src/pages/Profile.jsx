import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Grid,
  Avatar,
  Chip,
  CircularProgress,
  Switch,
  FormControlLabel,
} from '@mui/material';
import {
  Person,
  Edit,
  Save,
  Cancel,
  Lock,
} from '@mui/icons-material';
import { useFormik } from 'formik';
import * as yup from 'yup';
import { useSnackbar } from 'notistack';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

const validationSchema = yup.object({
  firstName: yup.string().required('First name is required').max(100, 'First name too long'),
  lastName: yup.string().required('Last name is required').max(100, 'Last name too long'),
  department: yup.string().max(100, 'Department name too long'),
});

const Profile = () => {
  const { user, updateUser } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  
  const [loading, setLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [notifications, setNotifications] = useState({
    email: true,
    in_app: true,
    expense_approved: true,
    expense_rejected: true,
  });

  // Fetch user profile
  const fetchProfile = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/users/profile');
      setUserProfile(response.data.data.user);
      
      if (response.data.data.user.notification_preferences) {
        setNotifications(response.data.data.user.notification_preferences);
      }
    } catch (error) {
      enqueueSnackbar('Failed to fetch profile', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const formik = useFormik({
    initialValues: {
      firstName: userProfile?.first_name || '',
      lastName: userProfile?.last_name || '',
      department: userProfile?.department || '',
    },
    enableReinitialize: true,
    validationSchema,
    onSubmit: async (values) => {
      try {
        setLoading(true);
        const response = await axios.put('/api/users/profile', {
          firstName: values.firstName,
          lastName: values.lastName,
          department: values.department,
        });

        setUserProfile(response.data.data.user);
        updateUser(response.data.data.user);
        setEditMode(false);
        enqueueSnackbar('Profile updated successfully', { variant: 'success' });
      } catch (error) {
        enqueueSnackbar('Failed to update profile', { variant: 'error' });
      } finally {
        setLoading(false);
      }
    },
  });

  const handleNotificationChange = async (setting, value) => {
    const newNotifications = { ...notifications, [setting]: value };
    setNotifications(newNotifications);

    try {
      await axios.put('/api/users/notifications', newNotifications);
      enqueueSnackbar('Notification preferences updated', { variant: 'success' });
    } catch (error) {
      setNotifications(notifications);
      enqueueSnackbar('Failed to update notifications', { variant: 'error' });
    }
  };

  const getRoleColor = (role) => {
    switch (role) {
      case 'admin': return 'error';
      case 'approver': return 'warning';
      case 'employee': return 'info';
      default: return 'default';
    }
  };

  if (loading && !userProfile) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Profile
      </Typography>
      <Typography variant="body1" color="textSecondary" paragraph>
        Manage your account settings and preferences
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Avatar sx={{ width: 100, height: 100, mx: 'auto', mb: 2 }}>
                {userProfile?.first_name?.[0]}{userProfile?.last_name?.[0]}
              </Avatar>
              
              <Typography variant="h5" gutterBottom>
                {userProfile?.first_name} {userProfile?.last_name}
              </Typography>
              <Typography variant="body2" color="textSecondary" gutterBottom>
                {userProfile?.email}
              </Typography>
              <Chip
                label={userProfile?.role || 'Unknown'}
                color={getRoleColor(userProfile?.role)}
                variant="outlined"
              />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Typography variant="h6">Personal Information</Typography>
                {!editMode ? (
                  <Button startIcon={<Edit />} onClick={() => setEditMode(true)}>
                    Edit Profile
                  </Button>
                ) : (
                  <Box display="flex" gap={1}>
                    <Button
                      startIcon={<Cancel />}
                      onClick={() => {
                        setEditMode(false);
                        formik.resetForm();
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      startIcon={<Save />}
                      variant="contained"
                      onClick={formik.handleSubmit}
                      disabled={loading}
                    >
                      Save
                    </Button>
                  </Box>
                )}
              </Box>

              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="First Name"
                    name="firstName"
                    value={formik.values.firstName}
                    onChange={formik.handleChange}
                    error={formik.touched.firstName && Boolean(formik.errors.firstName)}
                    helperText={formik.touched.firstName && formik.errors.firstName}
                    disabled={!editMode}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Last Name"
                    name="lastName"
                    value={formik.values.lastName}
                    onChange={formik.handleChange}
                    error={formik.touched.lastName && Boolean(formik.errors.lastName)}
                    helperText={formik.touched.lastName && formik.errors.lastName}
                    disabled={!editMode}
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Email"
                    value={userProfile?.email || ''}
                    disabled
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Department"
                    name="department"
                    value={formik.values.department}
                    onChange={formik.handleChange}
                    error={formik.touched.department && Boolean(formik.errors.department)}
                    helperText={formik.touched.department && formik.errors.department}
                    disabled={!editMode}
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          <Card sx={{ mt: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Notification Preferences
              </Typography>
              
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={notifications.email}
                        onChange={(e) => handleNotificationChange('email', e.target.checked)}
                      />
                    }
                    label="Email Notifications"
                  />
                </Grid>
                <Grid item xs={12}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={notifications.in_app}
                        onChange={(e) => handleNotificationChange('in_app', e.target.checked)}
                      />
                    }
                    label="In-App Notifications"
                  />
                </Grid>
                <Grid item xs={12}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={notifications.expense_approved}
                        onChange={(e) => handleNotificationChange('expense_approved', e.target.checked)}
                      />
                    }
                    label="Expense Approved Notifications"
                  />
                </Grid>
                <Grid item xs={12}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={notifications.expense_rejected}
                        onChange={(e) => handleNotificationChange('expense_rejected', e.target.checked)}
                      />
                    }
                    label="Expense Rejected Notifications"
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Profile;